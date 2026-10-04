"""Build training + held-out eval data from public datasets.

NO LEAKAGE by construction:
  finetune/data/<policy>.jsonl  -> TRAIN pool only (train.py --train-glob default)
  evals/datasets/<policy>_public.jsonl -> EVAL only (run_evals loads it,
    train.py never reads *_public)

Sources:
  llm_firewall : deepset/prompt-injections + jackhhao/jailbreak-classification
  content_safety: thesofakillers/jigsaw-toxic-comment-classification-challenge
  support_inbound: Tobi-Bueck/customer-support-tickets (English rows only;
    multilingual routing is a separate workstream)

Heuristic labels are audited by spot-printing (--audit N) before writing.
Row counts cap runtime on MPS (~4 min per 80 items per 3 epochs).

Usage:
  .venv/bin/python finetune/build_data.py --audit 12     # inspect, write nothing
  .venv/bin/python finetune/build_data.py                # write files
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "finetune" / "data"
EVAL = REPO / "evals" / "datasets"

SECRET_WORDS = re.compile(
    r"(system prompt|api[_ -]?key|secret|password|credential|private key|ssn|credit card|token)",
    re.I)
JAIL_WORDS = re.compile(
    r"\b(dan\b|jailbreak|ignore (all |your |previous )?(instructions|rules|directives)"
    r"|bypass|developer mode|no restrictions|unrestricted|roleplay as|pretend (you are|to be)"
    r"|do anything now|always comply|ethical guidelines don't apply)",
    re.I)
INJECT_WORDS = re.compile(
    r"(override|disregard|forget your|new instructions|system override|repeat your .*prompt"
    r"|print .*key|send .* to |email .* to |instead.*follow this)",
    re.I)
CHURN_WORDS = re.compile(r"(cancel|leav(e|ing)|switch(ing)? to|competitor|moving on|1-star|close (my|our) account|churn)", re.I)
REFUND_WORDS = re.compile(r"(refund|money back|chargeback|reimburse|duplicate (payment|charge)|billed twice|charged twice|wrong charge)", re.I)


def english_only(text: str) -> bool:
    """English rows only: LoRA trains the english checkpoint, and the eval
    scope for this round is English (multilingual routing is next)."""
    try:
        from laya.lang import is_english
        return bool(is_english(text))
    except Exception:
        return True

QUEUE_DEPT = {
    "Billing and Payments": "billing",
    "Returns and Exchanges": "billing",
    "Sales and Pre-Sales": "sales",
    "Technical Support": "technical",
    "Product Support": "technical",
    "IT Support": "technical",
    "Service Outages and Maintenance": "technical",
    "Customer Service": "other",
    "General Inquiry": "other",
    "Human Resources": "other",
}
PRIORITY_URGENCY = {"high": 2, "medium": 1, "low": 0}


def firewall_verdict(exp) -> str:
    sig = max([1.0 if exp.get("jailbreak") else 0.0, 1.0 if exp.get("injection") else 0.0,
               (exp.get("leak_risk", 0) or 0) / 2.0])
    if sig >= 0.85:
        return "block"
    if sig >= 0.5:
        return "review"
    return "allow"


def safety_verdict(exp) -> str:
    worst = max(1.0 if exp.get("toxic") else 0.0, 1.0 if exp.get("threat") else 0.0,
                (exp.get("severity", 0) or 0) / 2.0)
    if worst >= 0.85:
        return "block"
    if worst >= 0.5:
        return "review"
    return "allow"


def conv_deepset(n_train: int, n_eval: int, seed: int):
    from datasets import load_dataset
    ds = load_dataset("deepset/prompt-injections", split="train")
    rows = list(ds)
    rnd = random.Random(seed)
    rnd.shuffle(rows)
    out_train, out_eval = [], []
    for i, r in enumerate(rows):
        t = r["text"] or ""
        if not english_only(t):
            continue
        lab = int(r["label"])
        if lab == 1:
            exp = {"injection": True,
                   "leak_risk": 2 if SECRET_WORDS.search(t) else 1}
            if JAIL_WORDS.search(t):
                exp["jailbreak"] = True
        else:
            exp = {"injection": False, "jailbreak": False, "leak_risk": 0}
        row = {"id": f"deepset_{i}", "state": {"prompt": t},
               "expected": exp, "expected_verdict": firewall_verdict(exp)}
        (out_eval if i % 5 == 0 else out_train).append(row)
        if len(out_train) >= n_train and len(out_eval) >= n_eval:
            break
    return out_train[:n_train], out_eval[:n_eval]


def conv_jackhhao(n_train: int, n_eval: int, seed: int):
    from datasets import load_dataset
    ds = load_dataset("jackhhao/jailbreak-classification", split="train")
    rows = list(ds)
    rnd = random.Random(seed)
    rnd.shuffle(rows)
    out_train, out_eval = [], []
    for i, r in enumerate(rows):
        t = r["prompt"] or ""
        if not english_only(t):
            continue
        if r["type"] == "jailbreak":
            exp = {"jailbreak": True,
                   "injection": True if INJECT_WORDS.search(t) else False,
                   "leak_risk": 2 if SECRET_WORDS.search(t) else 1}
        else:
            exp = {"jailbreak": False, "injection": False, "leak_risk": 0}
        row = {"id": f"jackhhao_{i}", "state": {"prompt": t},
               "expected": exp, "expected_verdict": firewall_verdict(exp)}
        (out_eval if i % 5 == 0 else out_train).append(row)
        if len(out_train) >= n_train and len(out_eval) >= n_eval:
            break
    return out_train[:n_train], out_eval[:n_eval]


def conv_jigsaw(n_train: int, n_eval: int, seed: int):
    from datasets import load_dataset
    ds = load_dataset("thesofakillers/jigsaw-toxic-comment-classification-challenge",
                      split="train")
    pos, neg = [], []
    for r in ds:
        t = (r["comment_text"] or "").strip()
        if not t or len(t) > 800 or not english_only(t):
            continue
        toxic = bool(int(r["toxic"]) or int(r["insult"]) or int(r["obscene"])
                     or int(r["identity_hate"]))
        threat = bool(int(r["threat"]))
        sev = (2 if (int(r["severe_toxic"]) or threat or int(r["identity_hate"]))
               else 1 if toxic else 0)
        exp = {"toxic": toxic or threat, "threat": threat, "severity": sev}
        row = {"id": f"jigsaw_{r['id']}", "state": {"text": t},
               "expected": exp, "expected_verdict": safety_verdict(exp)}
        (pos if (toxic or threat) else neg).append(row)
    rnd = random.Random(seed)
    rnd.shuffle(pos)
    rnd.shuffle(neg)
    # balance: half toxic-ish, half clean
    train = (pos[:n_train // 2] + neg[:n_train // 2])
    # held-out eval: next slice, disjoint
    ev = (pos[n_train // 2:n_train // 2 + n_eval // 2]
          + neg[n_train // 2:n_train // 2 + n_eval // 2])
    rnd.shuffle(train)
    rnd.shuffle(ev)
    return train, ev


def conv_support(n_train: int, n_eval: int, seed: int):
    from datasets import load_dataset
    ds = load_dataset("Tobi-Bueck/customer-support-tickets", split="train")
    out = []
    for r in ds:
        if r["language"] != "en":
            continue
        body = f"{r['subject']}. {r['body']}".strip()[:1500]
        if not body:
            continue
        dept = QUEUE_DEPT.get(r["queue"], "other")
        exp = {"department": dept,
               "urgency": PRIORITY_URGENCY.get(r["priority"], 1),
               "churn_risk": bool(CHURN_WORDS.search(body)),
               "refund_requested": bool(REFUND_WORDS.search(body))}
        out.append({"id": f"tobi_{len(out)}", "state": {"body": body},
                    "expected": exp, "expected_verdict": "act"})
    rnd = random.Random(seed)
    rnd.shuffle(out)
    ev = out[:n_eval]
    train = [r for r in out[n_eval:]][:n_train]
    return train, ev


def write(path: Path, rows) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"wrote {len(rows)} -> {path}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit", type=int, default=0)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    fw_t1, fw_e1 = conv_deepset(320, 80, args.seed)
    fw_t2, fw_e2 = conv_jackhhao(160, 40, args.seed)
    fw_train, fw_eval = fw_t1 + fw_t2, fw_e1 + fw_e2
    sx_train, sx_eval = conv_jigsaw(420, 80, args.seed)
    sp_train, sp_eval = conv_support(360, 60, args.seed)

    if args.audit:
        for name, rows in [("firewall/train", fw_train), ("firewall/eval", fw_eval),
                           ("safety/train", sx_train), ("support/train", sp_train)]:
            print(f"--- {name} ({len(rows)})")
            for r in rows[:args.audit // 4]:
                print("  ", r["id"], r["expected"], str(r["state"])[:100].replace("\n", " "))
        return 0

    write(DATA / "llm_firewall.jsonl", fw_train)
    write(EVAL / "llm_firewall_public.jsonl", fw_eval)
    write(DATA / "content_safety.jsonl", sx_train)
    write(EVAL / "content_safety_public.jsonl", sx_eval)
    write(DATA / "support_inbound.jsonl", sp_train)
    write(EVAL / "support_inbound_public.jsonl", sp_eval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
