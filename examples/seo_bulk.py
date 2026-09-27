"""Bulk SEO workflows: internal links, intent, audit, prospecting, gate, answer grid.

Each job = deterministic prep in code (crawl, canonicals, existing links,
traffic) + ONE typed judgement per row via /predict/batch -> CSV with
choice/score + confidence. `options` is optional everywhere.

Jobs (policies in wayfinder/policies.yaml):
  internal_link  seo_internal_link  states: {source_url, passage, candidate_title, candidate_purpose}
  intent         seo_intent         states: {query or page title + snippet}
  audit          seo_audit          states: {url, title, snippet, traffic_band}
  prospect       seo_prospect       states: {prospect_url, why_fit}
  gate           seo_gate           states: {target_query, draft_excerpt, sources_note}
  answer         seo_answer         states: {buyer_question, page_url, page_excerpt}

Usage:
  python examples/seo_bulk.py internal_link --out links.csv   # demo rows when no --input
  python examples/seo_bulk.py intent --input queries.json --out intent.csv
  queries.json: [{"id": "q1", "text": "..."}] (or page/link/draft rows per job)

Scale shape: 1200 pages ~= 10 batch calls of 128; ~4k tokens/row on hosted
Jev ~= $0.22 total vs ~$27 single-pass frontier. Self-hosted here: $0.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys

import httpx

BASE = os.getenv("WAYFINDER_URL", "http://127.0.0.1:8000")
KEY = os.getenv("WF_KEY", "")

JOBS = {
    "internal_link": {"policy": "seo_internal_link",
                      "fields": ["id", "decision", "confidence", "relevance",
                                 "has_reason", "anchor_ready", "verdict"]},
    "intent": {"policy": "seo_intent",
               "fields": ["id", "intent", "confidence", "verdict"]},
    "audit": {"policy": "seo_audit",
              "fields": ["id", "action", "confidence", "freshness", "verdict"]},
    "prospect": {"policy": "seo_prospect",
                 "fields": ["id", "relevance", "confidence", "message_fit", "verdict"]},
    "gate": {"policy": "seo_gate",
             "fields": ["id", "intent_match", "grounded", "links_sane", "verdict", "confidence"]},
    "answer": {"policy": "seo_answer",
               "fields": ["id", "answer_relevance", "confidence", "verdict"]},
}


def _headers() -> dict:
    return {"authorization": f"Bearer {KEY}"} if KEY else {}


def _row(job: str, src: dict, res: dict) -> dict:
    a = res.get("answers", {})
    v = res.get("verdict", {})
    g = lambda n, k, d="": (a.get(n, {}).get(k, d))
    if job == "internal_link":
        return {"id": src.get("id", ""), "decision": "link" if float(a.get("relevance", {}).get("score", 0)) >= 1.5 and float(a.get("has_reason", {}).get("noul", 0)) >= 0.6 else "skip",
                "confidence": round(float(a.get("relevance", {}).get("confidence", 0.0)), 4),
                "relevance": round(float(a.get("relevance", {}).get("score", 0.0)), 3),
                "has_reason": round(float(a.get("has_reason", {}).get("noul", 0.0)), 4),
                "anchor_ready": round(float(a.get("anchor_ready", {}).get("noul", 0.0)), 4),
                "verdict": v.get("verdict", "")}
    if job == "intent":
        return {"id": src.get("id", ""), "intent": g("intent", "choice"),
                "confidence": round(float(a.get("intent", {}).get("confidence", 0.0)), 4),
                "verdict": v.get("verdict", "")}
    if job == "audit":
        return {"id": src.get("id", ""), "action": g("action", "choice"),
                "confidence": round(float(a.get("action", {}).get("confidence", 0.0)), 4),
                "freshness": round(float(a.get("freshness", {}).get("score", 0.0)), 3),
                "verdict": v.get("verdict", "")}
    if job == "prospect":
        return {"id": src.get("id", ""), "relevance": round(float(a.get("relevance", {}).get("score", 0.0)), 3),
                "confidence": round(float(a.get("relevance", {}).get("confidence", 0.0)), 4),
                "message_fit": round(float(a.get("message_fit", {}).get("noul", 0.0)), 4),
                "verdict": v.get("verdict", "")}
    if job == "gate":
        im, gr, ls = (float(a.get("intent_match", {}).get("noul", 0.0)),
                      float(a.get("grounded", {}).get("noul", 0.0)),
                      float(a.get("links_sane", {}).get("noul", 0.0)))
        ok = min(im, gr, ls) >= 0.8
        return {"id": src.get("id", ""), "intent_match": round(im, 4), "grounded": round(gr, 4),
                "links_sane": round(ls, 4), "verdict": "publish" if ok else "review",
                "confidence": round(min(im, gr, ls), 4)}
    # answer
    return {"id": src.get("id", ""), "answer_relevance": round(float(a.get("answer_relevance", {}).get("score", 0.0)), 3),
            "confidence": round(float(a.get("answer_relevance", {}).get("confidence", 0.0)), 4),
            "verdict": v.get("verdict", "")}


DEMO = {
    "internal_link": [
        {"id": "p1", "source_url": "/technical-seo-checklist", "passage": "A crawl reveals useful pages with few contextual internal links.", "candidate_title": "How to find orphan pages", "candidate_purpose": "Diagnose underlinked pages and reconnect them"},
        {"id": "p2", "source_url": "/pricing", "passage": "Plans start at $9 with annual billing.", "candidate_title": "How to find orphan pages", "candidate_purpose": "Diagnose underlinked pages and reconnect them"},
    ],
    "intent": [{"id": "q1", "text": "best crm for 20 person agency pricing"}, {"id": "q2", "text": "how to reset password"}],
    "audit": [{"id": "u1", "url": "/old-guide", "title": "2019 SEO guide", "snippet": "Keyword density tips from 2019.", "traffic_band": "low"}],
    "prospect": [{"id": "d1", "prospect_url": "https://example.com/seo-blog", "why_fit": "Covers technical audits weekly"}],
    "gate": [{"id": "g1", "target_query": "internal linking guide", "draft_excerpt": "Link related pages with descriptive anchors...", "sources_note": "based on site crawl + help docs"}],
    "answer": [{"id": "a1", "buyer_question": "How do I find orphan pages?", "page_url": "/orphans", "page_excerpt": "Run a crawl, filter pages with zero inlinks, add contextual links."}],
}


def run(job: str, states: list[dict], options: dict | None = None) -> list[dict]:
    policy = JOBS[job]["policy"]
    rows: list[dict] = []
    for i in range(0, len(states), 128):
        chunk = states[i:i + 128]
        payload: dict = {"policy": policy, "states": chunk}
        if options:
            payload["options"] = options
        r = httpx.post(f"{BASE}/predict/batch", headers=_headers(),
                       json=payload, timeout=120).json()
        rows.extend(_row(job, s, res) for s, res in zip(chunk, r["results"]))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("job", choices=sorted(JOBS))
    ap.add_argument("--input", default=None, help="JSON list of row dicts (each needs id)")
    ap.add_argument("--out", default=None)
    ap.add_argument("--auto-act-above", type=float, default=None)
    ap.add_argument("--escalate-below", type=float, default=None)
    a = ap.parse_args()
    states = json.load(open(a.input)) if a.input else DEMO[a.job]
    options = {}
    if a.auto_act_above is not None:
        options["auto_act_above"] = a.auto_act_above
    if a.escalate_below is not None:
        options["escalate_below"] = a.escalate_below
    rows = run(a.job, states, options or None)
    out = a.out or f"seo_{a.job}.csv"
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=JOBS[a.job]["fields"])
        w.writeheader()
        w.writerows(rows)
    print(f"{a.job}: {len(rows)} rows -> {out}")
    for r in rows[:10]:
        print(r)


if __name__ == "__main__":
    sys.exit(main())
