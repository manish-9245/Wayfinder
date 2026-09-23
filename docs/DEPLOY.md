# Deploy

## Local (dev: lazy load, instant boot)

```bash
python3 -m venv .venv && .venv/bin/python -m pip install -e ".[serve]"
WAYFINDER_PRELOAD=0 .venv/bin/python -m wayfinder.app   # http://127.0.0.1:8000
```

First inference downloads the checkpoint from Hugging Face (~400MB per
checkpoint, cached in `~/.cache/huggingface`). Offline afterwards.

## Local (prod-like, preloaded)

```bash
WAYFINDER_PRELOAD=1 LAYA_MODELS=english,multilingual .venv/bin/python -m wayfinder.app
```

## Docker Compose (gate + shared Redis cache)

```bash
docker compose up --build
WAYFINDER_API_KEY=secret docker compose up   # bearer enforced
```

`model-cache` volume persists `~/.cache/huggingface` across rebuilds so only
the first boot downloads.

## Kubernetes (shape, not a chart)

- Deployment: 1 worker/pod (`uvicorn --workers 1`), image from `Dockerfile`.
- HPA on p95 latency + CPU. Add replicas, not workers (torch + fork).
- Readiness: `GET /health` → `status: ready` (post-preload).
- Resources: CPU pods get `LAYA_THREADS` ≤ physical cores; GPU pods get
  `LAYA_DEVICE=cuda` + one pod per GPU.
- Secrets: `WAYFINDER_API_KEY` via Secret; `WAYFINDER_REDIS_URL` via Service DNS.
- Cache: managed Redis (1h TTL); pods survive its outage on local LRU.

## Performance checklist

- [ ] `WAYFINDER_PRELOAD=1` in every prod image (no cold builds on the hot path).
- [ ] `LAYA_MODELS` limited to what you serve (each resident checkpoint is VRAM/RAM).
- [ ] `LAYA_THREADS` ≤ physical cores on CPU nodes.
- [ ] Batch background workloads via `/predict/batch` (≤128 states/call).
- [ ] Redis enabled when replicas > 1 (shared hit rate).
- [ ] `/metrics` scraped (hit rate < 20% on repeated traffic = key bug).
- [ ] Thresholds tuned per policy after 1 week of escalation labels.
