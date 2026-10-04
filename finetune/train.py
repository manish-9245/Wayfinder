"""Supervised finetune for laya decision checkpoints on Wayfinder eval gold.

Reuses laya's own architecture + encoding (no reimplementation):
  forward/loss on DecisionModel, Agent._encode_state, collate_items w/ targets.
Saves a directory loadable by `Agent(path)` and servable via Router pinning.

Targets (one-hot over the question's options):
  choice -> 1 at gold label index
  score  -> 1 at gold level index
  noul   -> [1,0] false / [0,1] true   (option order is always [false, true])

Modes:
  --mode head-only  train decision heads only (fast, CPU-smokeable, first step)
  --mode full       train encoder + heads (needs GPU for real runs)
  --mode lora       LoRA on encoder via peft (needs `pip install peft`)

Splits: deterministic 80/20 train/heldout by row-id hash within each file, so
reruns are comparable. Extra training files: --train-glob 'finetune/data/*.jsonl'
(same schema as evals/datasets). The eval sets double as SEED training data;
grow them with production logs (see finetune/README.md) - training only on
eval rows and reporting on held-out eval rows from the same files is honest
for iteration but NOT a substitute for fresh held-out data before release.

Usage:
  .venv/bin/python finetune/train.py --smoke                       # 1-min CPU check
  .venv/bin/python finetune/train.py --policy lead_scoring --epochs 3 --mode head-only
  LAYA_DEVICE=cuda .venv/bin/python finetune/train.py --epochs 5 --mode lora --lr 2e-4
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

import yaml  # noqa: E402

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402


def stable_split(row_id: str, frac: float = 0.2) -> str:
    h = int(hashlib.sha256(row_id.encode()).hexdigest(), 16) % 1000
    return "heldout" if h < int(frac * 1000) else "train"


def gold_target(qtype: str, options: list[str], gold) -> list[float]:
    if qtype == "choice":
        return [1.0 if o == gold else 0.0 for o in options]
    if qtype == "score":
        return [1.0 if i == int(gold) else 0.0 for i in range(len(options))]
    if qtype == "noul":
        return [0.0, 1.0] if gold else [1.0, 0.0]
    raise ValueError(qtype)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--policy", default=None)
    ap.add_argument("--train-glob", default=None)
    ap.add_argument("--base", default="convaiinnovations/laya",
                    help="base checkpoint (hub id or local dir)")
    ap.add_argument("--mode", choices=["head-only", "full", "lora"], default="head-only")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--batch-items", type=int, default=16,
                    help="question-rows per forward pass (keep small on MPS/CPU)")
    ap.add_argument("--grad-accum", type=int, default=4,
                    help="optimizer step every N forward passes (effective batch = batch-items * grad-accum)")
    ap.add_argument("--autocast", action="store_true", default=True,
                    help="fp16/bf16 forward to halve activation memory (master weights stay fp32)")
    ap.add_argument("--no-autocast", dest="autocast", action="store_false")
    ap.add_argument("--heldout-frac", type=float, default=0.2)
    ap.add_argument("--output", default="finetune/out")
    ap.add_argument("--device", default=None)
    ap.add_argument("--max-len", type=int, default=256,
                    help="token cap for TRAINING rows only (eval data: median 39, p95 145; "
                         "inference stays at 512)")
    ap.add_argument("--smoke", action="store_true",
                    help="1 policy, 8 rows, 1 epoch, head-only: loop check")
    args = ap.parse_args()

    from laya.agent import Agent
    from laya.common import QTYPES, collate_items, render_options

    policies = yaml.safe_load(open(REPO / "wayfinder" / "policies.yaml"))["policies"]
    names = [args.policy] if args.policy else sorted(policies)
    if args.smoke:
        names = [names[0]]
        args.epochs = 1
        args.mode = "head-only"

    files: list[Path] = []
    for n in names:
        p = REPO / "evals" / "datasets" / f"{n}.jsonl"  # seed: exact file only
        if p.exists():                                  # (*_public = eval-only, never train)
            files.append(p)
    if args.train_glob:
        import glob as _glob
        files += [Path(p) for p in _glob.glob(args.train_glob)]
    if not args.train_glob:
        import glob as _glob
        files += [Path(p) for p in _glob.glob(str(REPO / "finetune" / "data" / "*.jsonl"))]

    agent = Agent(args.base, device=args.device)
    dev = next(agent.model.parameters()).device
    print(f"base={args.base} device={dev} mode={args.mode}")

    train_items: list[dict] = []
    held_rows: list[dict] = []  # (policy, row) for heldout eval
    for f in files:
        stem = f.stem
        pol = next((p for p in policies if stem == p or stem.startswith(p + "_")),
                   None)  # <policy>[_anything].jsonl
        if pol is None:
            print(f"skip {f}: matches no policy", file=sys.stderr)
            continue
        questions = policies[pol]["questions"]
        ids = list(questions)
        internal = {qid: Agent._to_internal(questions[qid]) for qid in ids}
        for line in open(f):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if args.smoke and len(train_items) >= 8:
                break
            if stable_split(row["id"], args.heldout_frac) == "heldout":
                held_rows.append((pol, row))
                continue
            enc = agent._encode_state(row["state"], ids, internal, max_len=args.max_len)
            for qid, it in zip(ids, enc):
                if qid not in row.get("expected", {}):
                    continue  # partial supervision: public rows need not cover every question
                q = internal[qid]
                opts = render_options(q)
                it["target"] = gold_target(q["t"], opts, row["expected"][qid])
                train_items.append(it)
    print(f"train rows(items)={len(train_items)} heldout rows={len(held_rows)}")
    if not train_items:
        print("nothing to train on", file=sys.stderr)
        return 2

    model = agent.model
    model.train()
    if args.mode == "head-only":
        for n, p in model.named_parameters():
            p.requires_grad = not n.startswith("encoder.")
    elif args.mode == "lora":
        try:
            from peft import LoraConfig, get_peft_model
        except ImportError:
            print("lora needs `pip install peft`", file=sys.stderr)
            return 2
        n_layers = max(int(n.split(".")[1]) for n, _ in model.encoder.named_parameters()
                       if n.split(".")[0] == "layers") + 1
        late = list(range(max(0, n_layers - 10), n_layers))  # late layers only: fits small GPUs
        cfg = LoraConfig(r=8, lora_alpha=16, lora_dropout=0.05,
                         target_modules=["Wqkv", "Wo", "Wi"],  # ModernBERT linears
                         layers_to_transform=late, layers_pattern="layers",
                         bias="none")
        print(f"lora layers {late[0]}..{late[-1]} of {n_layers}")
        model = get_peft_model(model, cfg)
        model.print_trainable_parameters()
    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=args.lr)

    pad = agent.tok.pad_token_id
    import random
    from contextlib import nullcontext
    random.seed(0)
    amp_dev = "mps" if str(dev).startswith("mps") else "cpu" if str(dev) == "cpu" else "cuda"
    amp_dtype = torch.bfloat16 if str(dev).startswith(("cuda", "mps")) else torch.float16
    def amp():
        return torch.autocast(device_type=amp_dev, dtype=amp_dtype) if args.autocast else nullcontext()
    for ep in range(args.epochs):
        random.shuffle(train_items)
        tot_loss = tot_n = 0
        opt.zero_grad()
        chunks = [train_items[s:s + args.batch_items]
                  for s in range(0, len(train_items), args.batch_items)]
        for ci, chunk in enumerate(chunks):
            b = collate_items([chunk], pad)
            ids_t = b["input_ids"].to(dev)
            att = b["attention_mask"].to(dev)
            mp = b["marker_pos"].to(dev)
            mm = b["marker_mask"].to(dev)
            qt = b["qtype"].to(dev)
            tgt = b["target"].to(dev)
            with amp():
                logits, _act = model(ids_t, att, mp, mm, qt)
                logp = torch.log_softmax(logits.float().masked_fill(~mm, -1e4), -1)
                loss = (-(tgt * logp * mm.float()).sum() / mm.float().sum().clamp_min(1)
                        / args.grad_accum)
            loss.backward()
            if (ci + 1) % args.grad_accum == 0 or ci + 1 == len(chunks):
                torch.nn.utils.clip_grad_norm_(params, 1.0)
                opt.step()
                opt.zero_grad()
            tot_loss += float(loss) * len(chunk) * args.grad_accum
            tot_n += len(chunk)
        print(f"epoch {ep + 1}/{args.epochs} loss={tot_loss / max(tot_n, 1):.4f}")

    # ---- heldout check with the eval metric (argmax) ----
    sys.path.insert(0, str(REPO / "evals"))
    from run_evals import score_one  # noqa: E402
    ok = n = 0
    model.eval()
    with torch.no_grad():
        for pol, row in held_rows:
            questions = policies[pol]["questions"]
            res = Agent  # placeholder to keep flake quiet
            pred = _predict_with_model(agent, model, dev, row["state"], questions)
            for qid, qdef in questions.items():
                if qid not in row.get("expected", {}):
                    continue  # partial gold
                o, _ = score_one(qdef["type"], pred[qid], row["expected"][qid])
                ok += bool(o)
                n += 1
    print(f"heldout Q acc={ok}/{n}={ok / max(n, 1):.4f}")

    # ---- save in Agent-loadable layout ----
    out = Path(args.output)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    _save_model(model, agent, args.base, out)
    print(f"saved to {out} - load with Agent('{out}')")
    return 0


@torch.no_grad()
def _predict_with_model(agent, model, dev, state, questions):
    from laya.common import QTYPES, collate_items, confidence_from_probs, render_options, temp_bucket
    import numpy as np

    ids = list(questions)
    internal = {qid: agent._to_internal(questions[qid]) for qid in ids}
    items = agent._encode_state(state, ids, internal)
    b = collate_items([items], agent.tok.pad_token_id)
    logits, _ = model(b["input_ids"].to(dev), b["attention_mask"].to(dev),
                      b["marker_pos"].to(dev), b["marker_mask"].to(dev),
                      b["qtype"].to(dev))
    logits = logits.float().cpu().numpy()
    answers = {}
    for j, qid in enumerate(ids):
        q = internal[qid]
        k = len(items[j]["markers"])
        z = logits[j, :k]
        p = np.exp(z - z.max())
        p = p / p.sum()
        if q["t"] == "choice":
            keys = list(q["crit"].keys())
            answers[qid] = {"type": "choice", "choice": keys[int(p.argmax())],
                            "probabilities": {kk: round(float(v), 4) for kk, v in zip(keys, p)},
                            "confidence": round(confidence_from_probs(p, k), 4)}
        elif q["t"] == "score":
            answers[qid] = {"type": "score", "score": round(float((np.arange(k) * p).sum()), 4),
                            "probabilities": {str(i): round(float(v), 4) for i, v in enumerate(p)},
                            "confidence": round(confidence_from_probs(p, k), 4)}
        else:
            answers[qid] = {"type": "noul", "noul": round(float(p[1]), 4),
                            "confidence": round(max(float(p[1]), 1 - float(p[1])), 4)}
    return answers


def _save_model(model, agent, base: str, out: Path) -> None:
    import json as _json
    from safetensors.torch import save_file
    # unwrap peft if present
    try:
        from peft import PeftModel
        if isinstance(model, PeftModel):
            model = model.merge_and_unload()
    except ImportError:
        pass
    state = {k: v.cpu() for k, v in model.state_dict().items() if "lora" not in k.lower()}
    save_file(state, str(out / "model.safetensors"))
    _json.dump(agent.cfg, open(out / "rl_agent_config.json", "w"), indent=2)
    # encoder/tokenizer dirs: resolve from local path or hub snapshot (cached)
    snap: Path | None = None
    if base and Path(str(base)).exists():
        snap = Path(str(base))
    else:
        try:
            from huggingface_hub import snapshot_download
            snap = Path(snapshot_download(
                base, allow_patterns=["tokenizer/*", "encoder/*"]))
        except Exception as exc:  # noqa: BLE001 - offline etc; reported, not fatal
            print(f"note: could not resolve base snapshot ({exc}); "
                  "copy encoder/* + tokenizer/* from base into out/")
    if snap is not None:
        for sub in ("encoder", "tokenizer"):
            src = snap / sub
            if src.exists():
                for f in src.rglob("*"):
                    if f.is_file():
                        dest = out / sub / f.relative_to(src)
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy(f, dest)


if __name__ == "__main__":
    raise SystemExit(main())
