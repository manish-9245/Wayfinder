"""Eval runner: per-policy accuracy for all 11 Wayfinder use cases.

Gold schema (evals/datasets/<policy>.jsonl, one JSON per line):
  {"id": str, "state": dict,
   "expected": {question_id: gold},
   "expected_verdict": str}

Gold per type:
  choice -> str label (exact criteria key)
  noul   -> bool (pred true iff noul >= 0.5)
  score  -> int level index 0-based (pred = round(score), exact + within-1 + MAE)

Usage:
  .venv/bin/python evals/run_evals.py                      # all policies, auto-routing
  .venv/bin/python evals/run_evals.py --policy support_inbound
  .venv/bin/python evals/run_evals.py --model multilingual --limit 5
  .venv/bin/python evals/run_evals.py --json-out evals/results.json

Exit code 0 always (this is a report, not a gate). Use --fail-under 0.95 in CI
to gate releases once baselines are green.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

import yaml  # noqa: E402

DATASETS = Path(__file__).parent / "datasets"


def load_policies(path=None):
    p = path or (REPO / "wayfinder" / "policies.yaml")
    return yaml.safe_load(open(p))["policies"]


def load_rows(policy: str):
    rows = []
    for path in sorted(DATASETS.glob(f"{policy}*.jsonl")):
        rows += [json.loads(line) for line in open(path) if line.strip()]
    return rows


def score_one(qtype: str, pred: dict, gold) -> tuple[bool, dict]:
    """Returns (correct, info)."""
    if qtype == "choice":
        got = pred.get("choice")
        return (got == gold, {"got": got, "want": gold})
    if qtype == "noul":
        p = float(pred.get("noul", 0.0))
        got = p >= 0.5
        want = bool(gold)
        return (got == want, {"got": got, "p": round(p, 4), "want": want})
    if qtype == "score":
        probs = pred.get("probabilities", {}) or {}
        try:
            got = int(round(float(pred.get("score", 0.0))))
        except (TypeError, ValueError):
            got = 0
        # Argmax is the classification decision (round(E) drags to the middle
        # under uncertainty); report both.
        try:
            amax = max(probs, key=lambda k: probs[k])
            got_argmax = int(amax)
        except (ValueError, TypeError):
            got_argmax = got
        want = int(gold)
        within1 = abs(got_argmax - want) <= 1
        return (got_argmax == want, {"got": got_argmax, "got_round": got,
                                    "want": want, "within1": within1,
                                    "ae": abs(got_argmax - want),
                                    "levels": len(probs)})
    raise ValueError(f"unknown qtype {qtype}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--policy", default=None)
    ap.add_argument("--model", default=None, help="pin checkpoint: english|multilingual|typed-decisions")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--json-out", default=None)
    ap.add_argument("--fail-under", type=float, default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--agent-path", default=None,
                    help="local finetuned dir (Agent-loadable) instead of hub Router")
    ap.add_argument("--policies", default=None,
                    help="candidate policies.yaml to evaluate (default: wayfinder/policies.yaml)")
    args = ap.parse_args()

    from laya import Router
    from wayfinder.policies import verdict_for

    policies = load_policies(args.policies)
    names = [args.policy] if args.policy else sorted(policies)
    if args.agent_path:
        from laya.agent import Agent
        _agent = Agent(args.agent_path, device=args.device)

        class _Direct:
            def predict(self, state, questions, **kw):
                return _agent.system_one(state, questions)
        router = _Direct()
    else:
        router = Router(device=args.device, preload=False)

    per_policy: dict = {}
    tot_q = tot_q_ok = tot_v = tot_v_ok = 0
    lat: list[float] = []

    for name in names:
        if name not in policies:
            print(f"unknown policy {name!r}", file=sys.stderr)
            return 2
        questions = policies[name]["questions"]
        rows = load_rows(name)
        if args.limit:
            rows = rows[: args.limit]
        q_ok = q_n = v_ok = 0
        by_q: dict[str, dict] = {}
        confs: list[float] = []
        corrects: list[bool] = []
        for row in rows:
            t0 = time.perf_counter()
            try:
                res = router.predict(row["state"], questions, model=args.model)
            except Exception as exc:  # noqa: BLE001 - evals must report, not crash
                print(f"  {row['id']}: ERROR {exc}")
                continue
            dt = (time.perf_counter() - t0) * 1000
            lat.append(dt)
            answers = res.get("answers", {})
            for qid, qdef in questions.items():
                if qid not in row.get("expected", {}):
                    continue  # partial gold (public rows): score what is labeled
                gold = row["expected"][qid]
                ok, _info = score_one(qdef["type"], answers.get(qid, {}), gold)
                q_n += 1
                q_ok += bool(ok)
                b = by_q.setdefault(qid, {"ok": 0, "n": 0})
                b["ok"] += bool(ok)
                b["n"] += 1
                c = answers.get(qid, {}).get("confidence")
                if isinstance(c, (int, float)):
                    confs.append(float(c))
                    corrects.append(bool(ok))
            want_v = row.get("expected_verdict")
            if want_v:
                try:
                    got_v = verdict_for(policies[name], answers)["verdict"]
                except Exception:  # noqa: BLE001
                    got_v = "?"
                tot_v += 1
                hit = got_v == want_v
                v_ok += hit
                tot_v_ok += hit
        per_policy[name] = {
            "q_acc": round(q_ok / max(q_n, 1), 4),
            "q_ok": q_ok, "q_n": q_n,
            "verdict_acc": round(v_ok / max(len(rows), 1), 4),
            "v_ok": v_ok, "v_n": len(rows),
            "by_question": {k: {"acc": round(v["ok"] / max(v["n"], 1), 4), **v} for k, v in by_q.items()},
        }
        tot_q += q_n
        tot_q_ok += q_ok
        print(f"{name:18s} Q {q_ok:3d}/{q_n:<3d}={q_ok/max(q_n,1):.3f}  "
              f"verdict {v_ok:3d}/{len(rows):<3d}={v_ok/max(len(rows),1):.3f}  "
              f"by_q " + " ".join(f"{k}={v['ok']/max(v['n'],1):.2f}" for k, v in by_q.items()))

    micro_q = tot_q_ok / max(tot_q, 1)
    macro_q = sum(p["q_acc"] for p in per_policy.values()) / max(len(per_policy), 1)
    micro_v = tot_v_ok / max(tot_v, 1)
    avg_ms = sum(lat) / max(len(lat), 1)
    print(f"\nMICRO Q {tot_q_ok}/{tot_q}={micro_q:.4f}  MACRO Q={macro_q:.4f}  "
          f"VERDICT {tot_v_ok}/{tot_v}={micro_v:.4f}  avg {avg_ms:.1f}ms/row")

    if args.json_out:
        json.dump({"micro_q_acc": micro_q, "macro_q_acc": macro_q,
                   "micro_verdict_acc": micro_v, "avg_ms": avg_ms,
                   "per_policy": per_policy},
                  open(args.json_out, "w"), indent=2)
        print(f"wrote {args.json_out}")

    if args.fail_under is not None and micro_q < args.fail_under:
        print(f"FAIL: micro Q {micro_q:.4f} < {args.fail_under}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
