"""Bulk lead scoring: 700 leads in seconds, CSV with confidence table.

Pattern (Jev decision-engine): model judges text, weights live in YOUR code.
Firmographic fit, date math, and CRM writes stay outside the model.

  POST /predict/batch {"policy": "lead_scoring", "states": [...128 max...]}
  -> per-row answers + verdict + confidence -> weights -> hot/warm/cold CSV

`options` (confidence override) is fully optional: omit it for policy
defaults (auto_act_above=0.80, escalate_below=0.50), or pass e.g.
{"auto_act_above": 0.9} to tighten hot without redeploying.

Usage:
  WAYFINDER_URL=http://127.0.0.1:8000 WF_KEY=wf_... python examples/lead_scoring.py leads.json --out scored.csv
  leads.json: [{"id": "l1", "body": "...enquiry text..."}, ...]
  No file? Runs a 6-row demo.

Cost shape (hosted Jev): ~500 tokens/lead -> 700 leads ~= $0.015.
Self-hosted here: $0, ~25ms/lead batched on CPU, ~1ms/q on GPU.
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

# Weights sales-ops owns. Change + re-run last month when reps disagree.
W_NEED, W_TIME, W_AUTH, W_BUDGET = 0.4, 0.3, 0.2, 0.1
HOT_AT, COLD_BELOW = 0.65, 0.35  # score bands (sheet, not code, in prod)

TIMELINE_MAP = {"this_month": 1.0, "this_quarter": 0.66, "later": 0.33, "not_stated": 0.0}
AUTHORITY_MAP = {"decides": 1.0, "evaluates": 0.66, "researching": 0.33, "not_stated": 0.0}
BUDGET_MAP = {"explicit": 1.0, "discussing": 0.5, "not_stated": 0.0}


def _headers() -> dict:
    return {"authorization": f"Bearer {KEY}"} if KEY else {}


def _choice(ans: dict) -> tuple[str, float]:
    return ans.get("choice", "not_stated"), float(ans.get("confidence", 0.0))


def _score01(ans: dict, levels: int) -> tuple[float, float]:
    return float(ans.get("score", 0.0)) / max(levels - 1, 1), float(ans.get("confidence", 0.0))


def score_row(answers: dict) -> dict:
    """Model answers in, CRM fields out. Low confidence -> unknown -> warm."""
    is_sales = float(answers.get("is_sales_enquiry", {}).get("noul", 0.0))
    need, need_c = _score01(answers.get("need", {}), 4)
    tl, tl_c = _choice(answers.get("timeline", {}))
    au, au_c = _choice(answers.get("authority", {}))
    bu, bu_c = _choice(answers.get("budget", {}))
    if tl_c < 0.5:
        tl = "not_stated"
    if au_c < 0.5:
        au = "not_stated"
    if bu_c < 0.5:
        bu = "not_stated"
    min_conf = min([need_c, tl_c, au_c, bu_c] + [is_sales if is_sales >= 0.5 else 1 - is_sales])
    if is_sales < 0.5:
        return {"score": 0.0, "band": "not_sales", "min_confidence": round(min_conf, 4),
                "need": need, "timeline": tl, "authority": au, "budget": bu}
    s = (W_NEED * need + W_TIME * TIMELINE_MAP.get(tl, 0.0)
         + W_AUTH * AUTHORITY_MAP.get(au, 0.0) + W_BUDGET * BUDGET_MAP.get(bu, 0.0))
    if min_conf < 0.5:
        band = "warm"  # unsure is never cold — ask the qualifying question
    elif s >= HOT_AT:
        band = "hot"
    elif s < COLD_BELOW:
        band = "cold"
    else:
        band = "warm"
    return {"score": round(s, 4), "band": band, "min_confidence": round(min_conf, 4),
            "need": round(need, 4), "timeline": tl, "authority": au, "budget": bu}


def batch_score(states: list[dict], options: dict | None = None) -> list[dict]:
    out: list[dict] = []
    for i in range(0, len(states), 128):
        chunk = states[i:i + 128]
        payload: dict = {"policy": "lead_scoring",
                         "states": [{"body": s.get("body", "")} for s in chunk]}
        if options:  # optional confidence override; omit for defaults
            payload["options"] = options
        r = httpx.post(f"{BASE}/predict/batch", headers=_headers(),
                       json=payload, timeout=120).json()
        for src, res in zip(chunk, r["results"]):
            row = {"id": src.get("id", ""), **score_row(res.get("answers", {}))}
            row["verdict"] = res.get("verdict", {}).get("verdict", "")
            row["verdict_confidence"] = res.get("verdict", {}).get("confidence", "")
            out.append(row)
    return out


DEMO = [
    {"id": "l1", "body": "We need SSO for 200 seats by end of month, I own budget. Send pricing?"},
    {"id": "l2", "body": "Just browsing, maybe next year, student project."},
    {"id": "l3", "body": "Checkout blank after Pay, enterprise tier, fix today or we cancel."},
    {"id": "l4", "body": "Hiring support reps? See my resume attached."},
    {"id": "l5", "body": "Comparing you vs Okta this quarter, evaluating for our team of 40."},
    {"id": "l6", "body": "Free trial broken, login loops, need help resetting."},
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", nargs="?", help="JSON list of {id, body}")
    ap.add_argument("--out", default="scored_leads.csv")
    ap.add_argument("--auto-act-above", type=float, default=None, help="optional confidence override")
    ap.add_argument("--escalate-below", type=float, default=None, help="optional confidence override")
    a = ap.parse_args()
    states = json.load(open(a.input)) if a.input else DEMO
    options = {}
    if a.auto_act_above is not None:
        options["auto_act_above"] = a.auto_act_above
    if a.escalate_below is not None:
        options["escalate_below"] = a.escalate_below
    rows = batch_score(states, options or None)
    with open(a.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "score", "band", "min_confidence",
                                          "need", "timeline", "authority", "budget",
                                          "verdict", "verdict_confidence"])
        w.writeheader()
        w.writerows(rows)
    print(f"scored {len(rows)} leads -> {a.out}")
    for r in rows[:10]:
        print(r)


if __name__ == "__main__":
    sys.exit(main())
