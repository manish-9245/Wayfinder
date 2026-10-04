# Finetune: from 66.7% to 95%+ per-question accuracy

Three levers, in order. Production (`wayfinder/policies.yaml`, gateway code)
is never touched by these scripts — they produce measured PROPOSALS.

## 1. Threshold calibration (no weight updates, minutes)

```bash
.venv/bin/python finetune/calibrate.py --json-out finetune/thresholds.json
.venv/bin/python finetune/calibrate.py --agent-path finetune/out-lora-all \
    --json-out finetune/thresholds-lora.json
```

Grid-searches `(auto_act_above, escalate_below)` per policy against human
gold verdicts, inside sane bounds (a review band must exist). Output is a
proposal for human review — small-n policies (<30 rows) are flagged.

## 2. Weight finetuning (LoRA, ~5 min/policy on MPS, ~25 min all)

```bash
.venv/bin/python finetune/train.py --smoke                 # 1-min loop check
.venv/bin/python finetune/train.py --policy lead_scoring --epochs 3 --mode lora
.venv/bin/python finetune/train.py --epochs 4 --mode lora --output finetune/out-v1
.venv/bin/python finetune/train.py --base finetune/out-v1 --epochs 6 \
    --output finetune/out-v2   # continue training
```

- Reuses laya's own architecture/encoding/loss code (`Agent`, `collate_items`,
  one-hot targets, cross-entropy). No reimplementation to drift.
- Modes: `head-only` (fast, weak — heads are tiny), `lora` (default, 1.7% of
  params, where the lift is), `full` (GPU-only in practice).
- Split is a deterministic 80/20 by row-id hash; add data with
  `--train-glob 'finetune/data/*.jsonl'` (same schema as evals).
- Saves an `Agent()`-loadable dir (`model.safetensors` fp32 +
  `rl_agent_config.json` + `encoder/` + `tokenizer/`). Serve with
  `Router(models={'english': '<dir>'})` or pin `model` per call.
- Evaluate with `evals/run_evals.py --agent-path <dir>`.

Measured (Oct 2026, MPS, LoRA r=16 lr 1-2e-4, 393 train items):

| stage | micro Q | macro Q | heldout Q | note |
|---|---|---|---|---|
| base (hub english) | 66.7% | 61.9% | — | argmax scoring; `is_sales_enquiry` 15%, SEO 25-65% |
| head-only, 5ep | 66.9% | 62.0% | — | heads are tiny; errors live in the encoder |
| LoRA r1, 4ep | 84.1% | 81.7% | 73.8% | lead 59→78%, firewall 71→90%, prospect 42→92% |
| LoRA r2 (+6ep, lr 1e-4) | **89.9%** | **87.9%** | **74.8%** | 5 policies ≥92%; train-fit saturating, heldout flat |

5 policies ≥92% on full eval (train-inclusive): `content_safety` 98%,
`seo_answer` 100%, `seo_internal_link` 100%, `seo_prospect` 96%,
`support_inbound` 93%. Laggards: `seo_intent` 55% (`other`-criterion
attracts 35-80% mass — see candidate wording, needs retrain),
`seo_audit/action` 50% (model overpredicts `keep`; merge/remove boundary
is fuzzy even for annotators — needs rubric + multi-annotator golds),
`model_router` 82% (`human` has 4 rows — needs data).
Verdict-vs-human-gold stays 40-55%: expected — non-safety verdicts are
confidence gates, so this metric tracks calibration, not correctness.
Recalibrate thresholds per artifact (`calibrate.py --agent-path ...`;
`support_inbound` recovers to 100%, firewall to 58-88%) and refit
temperatures (still TODO) before trusting `auto_act_above`.

## 3. Criteria wording (prompt-level, measured as proposals)

When a question's phrasing fights the model (e.g. `is_sales_enquiry`'s
"rather than" construction scored 15% until reworded; `seo_intent`'s `other`
criterion attracts 35-80% mass on clear-cut queries), test variants against
the evals and ship the winner as a `policies.yaml` patch — with the measured
delta attached, never by vibes.

## Path to 95%+ (what remains)

1. **More labeled rows** (biggest lever): 10-24 rows/policy memorizes;
   heldout trails train-fit by ~10 pts. Mine scrubbed production logs for
   hard negatives; add multilingual rows. Target: 100+/policy, fresh
   held-out slice the trainer never sees.
2. **More epochs / full-encoder run on GPU**: loss was still falling at
   epoch 4; MPS full-finetune OOMs past batch 16 — this is a GPU job.
3. **Temperature refit after training**: CE sharpens logits; stale
   temperatures collapse extreme probabilities (verdicts suffer while
   argmax accuracy rises). Refit per-bucket temps on held-out NLL, then
   re-run `calibrate.py`.
4. **Adjudicate contested golds**: `model_router/human` (4 rows),
   `seo_audit/action` edge cases — single annotator, no adjudication yet.
5. **Serve the winner**: LoRA-merged dir + calibrated thresholds per policy;
   gate releases with `run_evals.py --fail-under 0.95`.
