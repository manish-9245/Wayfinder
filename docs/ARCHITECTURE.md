# Architecture

![request path](architecture.svg)

```
any client ──▶  gate (this repo)  ──▶  laya (pip package)  ──▶  checkpoints
  HTTP/MCP/TS      policies, cache,      Router, typed
  LangGraph        verdict, metrics      answers
```

## Why this shape

- **Zero model code here.** All weights/forward passes live in the `laya`
  pip package. Gate is glue: validation, policy thresholds, cache, auth,
  observability. Upstream releases arrive via `pip install -U laya`.
- **Stateless = scalable.** Request carries everything (state, policy,
  overrides). No sessions, no sticky LBs. Replicas share nothing except
  optional Redis cache. Scale with container count, not threads.
- **One Router per worker, preloaded.** Cold checkpoint build costs seconds;
  language detection costs microseconds. `WAYFINDER_PRELOAD=1` pays the build at
  boot (readiness gate) so p50 stays at inference cost (~33ms GPU,
  ~200-450ms CPU).
- **Cache before torch.** `sha256(state+questions+model)` → LRU (default
  2048 entries) → Redis (1h TTL, shared). Repeated traffic never touches
  the GPU. Measured effect: spam waves/retries/pollers collapse to µs.
- **Batch at the edge.** `/predict/batch` (≤128 states) routes once, groups
  by checkpoint+schema, and calls `Router.predict_batch` so compatible
  states share forward passes (~1ms/q batched vs ~10ms solo on GPU).

## Request lifecycle

1. Auth (timing-safe bearer iff `WAYFINDER_API_KEY` set) → body cap (413) →
   state/question caps (422/413).
2. Policy resolve (YAML, loaded once at boot) + per-call threshold overrides.
3. Cache lookup → HIT: return with `cache_hit:true`.
4. MISS: `Router.predict` (outside any global lock. Router's own
   load/evict is thread-safe upstream; locking here would serialise
   throughput) → store LRU (+Redis) → `verdict_for` (pure function) →
   audit log (PII-scrubbed) → metrics.
5. Verdict semantics: safety policies (`llm_firewall`, `content_safety`)
   emit `allow/review/block`; routing policies emit `act/review/escalate`.

## Failure modes

| Failure | Behaviour |
|---|---|
| Router not ready | 503 (readiness probes hold traffic until preload done) |
| Bad question schema | 422 naming the policy/question and the fix |
| Oversize body/state | 413 / 422 before tokenization (OOM guard) |
| Redis down | Logged warning, local LRU continues (degraded, not down) |
| Model download fails (first boot, offline) | 500 with cause, no crash; `/health` stays loading |

## What NOT to add here

Custom training, dashboards, user accounts, per-tenant weights. Those belong
in adjacent services. Gate stays a fast, boring, horizontally scalable
function: `(policy, state) -> (answers, verdict)`.
