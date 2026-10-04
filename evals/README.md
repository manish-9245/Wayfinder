# Evals: 11 use cases, gold labels, one runner

`datasets/<policy>.jsonl` — one JSON object per line:

```json
{"id": "support_inbound_001",
 "state": {"body": "I was billed twice..."},
 "expected": {"department": "billing", "urgency": 2,
              "churn_risk": true, "refund_requested": true},
 "expected_verdict": "act"}
```

Gold per question type (matches `wayfinder/policies.yaml`):

| type | gold | correct when |
|---|---|---|
| `choice` | label string (exact criteria key) | `pred.choice == gold` |
| `noul` | bool | `(pred.noul >= 0.5) == gold` |
| `score` | int level index, 0-based | `argmax(pred.probabilities) == gold` (also tracks within-1 + MAE) |

`expected_verdict` is the human-judged right action (`act/review/escalate`
for routing policies, `allow/review/block` for safety policies).

## Run

```bash
.venv/bin/python evals/run_evals.py --json-out evals/results.json
.venv/bin/python evals/run_evals.py --policy lead_scoring --limit 5
.venv/bin/python evals/run_evals.py --agent-path finetune/out-lora-all  # finetuned dir
.venv/bin/python evals/run_evals.py --fail-under 0.95   # CI gate (once green)
```

Reports micro/macro per-question accuracy, verdict accuracy, per-question
breakdown, avg ms/row. Exit code is 0 unless `--fail-under` trips.

## What the numbers mean (Oct 2026 baseline, english checkpoint, CPU)

- Per-question accuracy = model capability. This is the finetune target (95%+).
- Verdict accuracy vs human gold conflates calibration: for non-safety
  policies the verdict is confidence-gating (`act` iff confidence >=
  `auto_act_above`), so a correct-but-unsure answer yields `review`.
  Tune thresholds with `finetune/calibrate.py`; judge the doubt layer by
  selective-prediction (confident rows should be more accurate), not raw
  verdict match.

## Growing the sets

These 188 rows are SEED data. Before any release claim: mine production
logs (scrubbed) for hard negatives, add multilingual rows (100+ languages
claim is currently unevaluated), and hold out a fresh slice the trainer
never sees (`--train-glob` + hash split in `finetune/train.py` keep reruns
comparable, but same-file heldouts are iteration-grade, not release-grade).
