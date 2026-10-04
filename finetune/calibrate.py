"""Threshold calibration: per-policy (auto_act_above, escalate_below) sweep.

Verdicts are pure functions of (thresholds, answers), so this step needs no
weight updates and never touches production: it REPORTS the best thresholds
on evals/datasets gold verdicts. A human applies them to wayfinder/policies.yaml
(or per-call options) after review.

Constraints (anti-gaming):
  auto_act_above in [0.60 .. 0.95], escalate_below in [0.30 .. 0.70],
  and escalate_below <= auto_act_above - 0.10 (a review band must exist).
Safety policies (llm_firewall, content_safety) keep block semantics; the sweep
still applies since verdict_for shares the same two knobs.

Usage:
  .venv/bin/python finetune/calibrate.py                      # all policies
  .venv/bin/python finetune/calibrate.py --policy seo_intent
  .venv/bin/python finetune/calibrate.py --predictions evals/baseline.json
"""

from __future__ import annotations

import argparse
import itertools
import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

import yaml  # noqa: E402

GRID_HIGH = [0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]
GRID_LOW = [0.30, 0.40, 0.50, 0.60, 0.70]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--policy", default=None)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--json-out", default="finetune/thresholds.json")
    ap.add_argument("--agent-path", default=None,
                    help="local finetuned dir to calibrate (default: hub Router)")
    args = ap.parse_args()

    from wayfinder.policies import verdict_for

    policies = yaml.safe_load(open(REPO / "wayfinder" / "policies.yaml"))["policies"]
    names = [args.policy] if args.policy else sorted(policies)
    if args.agent_path:
        from laya.agent import Agent
        _agent = Agent(args.agent_path, device=args.device)

        class _Direct:
            def predict(self, state, questions, **kw):
                return _agent.system_one(state, questions)
        router = _Direct()
    else:
        from laya import Router
        router = Router(device=args.device, preload=False)

    report: dict = {}
    for name in names:
        pol = policies[name]
        rows = [json.loads(l) for l in open(REPO / "evals" / "datasets" / f"{name}.jsonl") if l.strip()]
        if args.limit:
            rows = rows[: args.limit]
        # cache model answers once; sweep is pure-python after that
        cached = []
        for row in rows:
            t0 = time.perf_counter()
            res = router.predict(row["state"], pol["questions"])
            cached.append((row, res["answers"], (time.perf_counter() - t0) * 1000))
        base = sum(
            verdict_for(pol, a)["verdict"] == r.get("expected_verdict") for r, a, _ in cached
        ) / max(len(cached), 1)

        best = (pol.get("auto_act_above", 0.85), pol.get("escalate_below", 0.60), base)
        for hi, lo in itertools.product(GRID_HIGH, GRID_LOW):
            if lo > hi - 0.10:
                continue
            trial = dict(pol, auto_act_above=hi, escalate_below=lo)
            acc = sum(
                verdict_for(trial, a)["verdict"] == r.get("expected_verdict") for r, a, _ in cached
            ) / max(len(cached), 1)
            if acc > best[2]:
                best = (hi, lo, acc)
        has_low = "escalate_below" in pol
        report[name] = {
            "default": {"auto_act_above": pol.get("auto_act_above"),
                        "escalate_below": pol.get("escalate_below"),
                        "verdict_acc": round(base, 4)},
            "best": {"auto_act_above": best[0],
                     **({"escalate_below": best[1]} if has_low else {}),
                     "verdict_acc": round(best[2], 4)},
            "n": len(cached),
            "note": ("small-n: verify on held-out rows before shipping"
                     if len(cached) < 30 else "ok"),
        }
        d, b = report[name]["default"], report[name]["best"]
        print(f"{name:18s} default hi={d['auto_act_above']} lo={d.get('escalate_below')} "
              f"acc={d['verdict_acc']:.3f}  ->  best hi={b['auto_act_above']} "
              f"lo={b.get('escalate_below')} acc={b['verdict_acc']:.3f}  n={len(cached)}")

    json.dump(report, open(args.json_out, "w"), indent=2)
    print(f"wrote {args.json_out} (PROPOSAL only - not applied to policies.yaml)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
