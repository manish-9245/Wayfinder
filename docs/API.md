# API reference

Base URL: `https://wayfinder-backend.buildwithmanish.com`. Interactive
try-it-now: the [console](/console) on this site. Every `POST` needs
`Authorization: Bearer <key>` — grab a `wf_…` service key from the
[dashboard](/dashboard) after signing in.

```bash
export WF_URL=https://wayfinder-backend.buildwithmanish.com
export WF_KEY=wf_…   # dashboard → API keys
```

## POST /v1/decide/{policy}

Run a named policy. The workhorse: one call, answers plus verdict.

```bash
curl $WF_URL/v1/decide/support_inbound \
  -H "authorization: Bearer $WF_KEY" -H 'content-type: application/json' -d '{
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

Response: `answers` + `routing` + `usage`, plus:

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
result out. Existing Jev clients repoint `baseUrl` at `$WF_URL` unchanged
(plus the `Authorization` header).

## POST /predict

Raw `{state, questions}` with auto-routing. Question schema: `choice` needs
`criteria` (label → description), `score` needs an ordered `criteria` list,
`noul` needs none.

## POST /predict/batch

Up to 128 states against one questions schema (or `policy`). Cache hits are
resolved without touching the model; misses share forward passes.

```bash
curl $WF_URL/predict/batch \
  -H "authorization: Bearer $WF_KEY" -H 'content-type: application/json' -d '{
  "states": [{"body": "refund pls"}, {"body": "server down!"}],
  "policy": "support_inbound"
}'
```

## POST /mcp/

Hosted MCP endpoint (Streamable HTTP, stateless — note the trailing slash).
Point any MCP client at `$WF_URL/mcp/` with the same bearer key — see
[MCP](MCP.md) for client config.

## GET /policies · /policies?full=1

Policy catalogue. Default returns question names; `full=1` returns full schemas.

## GET /health · /metrics

`health` is the readiness probe (`ready` once warmed) and lists loaded
policies plus cache size. `metrics` returns request counts, cache hit rate,
average latency, blocks, errors, and rejection counters. Scrape it.

## Errors

| Code | Meaning |
|---|---|
| 401 | sign-in required — log in or send a `wf_…` API key |
| 404 | unknown route or doc |
| 413 | body or batch too large |
| 422 | unknown policy, empty state, or malformed question |
| 500 | inference failure (generic detail; the request ID traces it server-side) |
| 503 | still warming up (hit `/health` until `ready`) |

Every response carries an `X-Request-ID` header — include it in support
requests so an operator can trace the exact call.

## Python / TypeScript

```python
import httpx
r = httpx.post("https://wayfinder-backend.buildwithmanish.com/v1/decide/support_inbound",
               headers={"authorization": f"Bearer {WF_KEY}"},
               json={"state": {"body": text}}, timeout=60).json()
if r["verdict"]["verdict"] == "act":
    route_automatically(r)
else:
    escalate_to_human(r)
```

```ts
const r = await fetch("https://wayfinder-backend.buildwithmanish.com/v1/decide/model_router", {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${WF_KEY}` },
  body: JSON.stringify({ state: { request } }),
}).then(r => r.json());
```

Self-hosting the gateway (source, local setup, operator runbook) lives on
[GitHub](https://github.com/manish-9245/Wayfinder).
