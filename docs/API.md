# API reference

Base URL: `http://127.0.0.1:8000`. Interactive try-it-now: `GET /docs` (OpenAPI).
Every `POST` accepts `Authorization: Bearer <key>` when `WAYFINDER_API_KEY` is set.

## POST /v1/decide/{policy}

Run a named policy. The workhorse: one call, answers plus verdict.

```bash
curl localhost:8000/v1/decide/support_inbound -H 'content-type: application/json' -d '{
  "state": {"body": "Billed twice, refund today or we cancel"},
  "model": null,
  "options": {"auto_act_above": 0.9}
}'
```

| Field | Meaning |
|---|---|
| `state` | string, dict, or list: the text or record to judge |
| `model` | omit to auto-route by language; or `english` / `multilingual` / `typed-decisions` |
| `task` | optional task override for the typed-decisions checkpoint |
| `lang` | ISO code hint; skips detection when you already know it |
| `options.auto_act_above` / `options.escalate_below` | per-call threshold overrides |

Response: laya `answers` + `routing` + `usage`, plus:

```json
{
  "policy": "support_inbound",
  "verdict": {"verdict": "act", "confidence": 0.89, "trigger": "refund_requested"},
  "thresholds": {"auto_act_above": 0.85, "escalate_below": 0.6},
  "cache_hit": false
}
```

Safety policies (`llm_firewall`, `content_safety`) return
`allow` / `review` / `block`; routing policies return `act` / `review` / `escalate`.

## POST /v1/systemone

Jev-compatible passthrough: `{state, questions, model?, task?, lang?}` in,
laya result out. Existing Jev clients repoint `baseUrl` here unchanged.

## POST /predict

Raw `{state, questions}` with auto-routing. Same question schema as laya:
`choice` needs `criteria` (label → description), `score` needs ordered
`criteria` list, `noul` needs none.

## POST /predict/batch

Up to 128 states against one questions schema (or `policy`). Cache hits are
resolved without torch; misses share forward passes via `Router.predict_batch`.

```bash
curl localhost:8000/predict/batch -H 'content-type: application/json' -d '{
  "states": [{"body": "refund pls"}, {"body": "server down!"}],
  "policy": "support_inbound"
}'
```

## GET /policies · /policies?full=1

Policy catalogue. Default returns question names; `full=1` returns full schemas.

## GET /health · /metrics

`health` is the readiness probe (`ready` only after Router preload) and lists
loaded policies plus cache size. `metrics` returns request counts, cache hit
rate, average latency, blocks and errors. Scrape it with Prometheus.

## Errors

| Code | Meaning |
|---|---|
| 401 | bad/missing bearer token (only when `WAYFINDER_API_KEY` is set) |
| 404 | unknown route or doc |
| 413 | body or batch too large |
| 422 | unknown policy, empty state, or malformed question |
| 500 | inference failure (cause in `detail`, never a path) |
| 503 | router still loading (hit `/health` until `ready`) |

## Python / TypeScript

```python
import httpx
r = httpx.post("http://localhost:8000/v1/decide/support_inbound",
               json={"state": {"body": text}}, timeout=60).json()
if r["verdict"]["verdict"] == "act":
    route_automatically(r)
else:
    escalate_to_human(r)
```

```ts
const r = await fetch("http://localhost:8000/v1/decide/model_router", {
  method: "POST", headers: {"content-type": "application/json"},
  body: JSON.stringify({ state: { request } }),
}).then(r => r.json());
```
