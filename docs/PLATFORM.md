# Platform guide: auth, keys, metrics, logs, rate limits, admin

The hosted gateway is a full platform, not just an inference endpoint:

| Concern | Implementation |
|---|---|
| Identity | Managed sign-in (email/password + optional Google/GitHub OAuth). No passwords touch this service |
| Service auth | Per-user `wf_…` API keys (sha256-hashed at rest, shown once) |
| Rate limits | Per-key/user + per-IP windows, tiered by plan (shared across replicas) |
| Quotas | Monthly request caps per plan, customizable per user |
| Logs | One PII-scrubbed row per call (success, 422, 500, 429) |
| Dashboards | `/dashboard` (users), `/admin` (super-admins) on this site |

## 1. Get access (hosted, 30 seconds)

1. Sign in on this site (`/auth`).
2. Open `/dashboard` → API keys → **Create key**. The raw `wf_…` secret is
   shown once — store it in an env var.
3. Call the API with `Authorization: Bearer wf_…`, or paste the key into
   **Use in console** on the dashboard and this browser's console adopts it.

How it works: the browser only talks to the web origin. `/api/*` is proxied
to the gateway, so sessions stay first-party — no CORS or third-party-cookie
pitfalls. The gateway mirrors each user into its own `users` table
(role/plan/quota live there) and attributes every inference call.
Super-admin = DB `role=admin`, or email in the operator's superadmin list.

Running your own stack (SuperTokens core, Postgres, Railway runbook,
operator env reference) is documented on
[GitHub](https://github.com/manish-9245/Wayfinder).

## 2. API reference (platform)

All JSON. User routes accept a signed-in session **or** a `wf_…` key. Admin
routes need `role=admin` (an admin's `wf_…` key works for scripts).

```
POST   /v1/keys                    {name} -> {key (raw, ONCE), prefix, …} (201)
GET    /v1/keys                    my keys (hashes never leave the server)
DELETE /v1/keys/{prefix}           revoke mine (204)

GET    /v1/me                      profile + plan + quota_used + rate_per_min
GET    /v1/me/usage?days=30        totals, daily[], by_policy[], by_verdict[], quota
GET    /v1/me/logs?policy=&verdict=&search=&errors_only=&limit=&offset=

GET    /v1/admin/overview?days=    global totals + daily + policies + verdicts + top users + counts
GET    /v1/admin/users?search=&limit=&offset=
PATCH  /v1/admin/users/{id}        {role?, plan?, quota_monthly? (0 resets to plan default), is_active?}
GET    /v1/admin/keys?search=&limit=&offset=
DELETE /v1/admin/keys/{prefix}     revoke any key (204)
GET    /v1/admin/logs              same filters as /v1/me/logs, plus ?user_id=
GET    /v1/admin/system            router, policies, cache, redis, db, auth, limits, quotas
GET    /v1/admin/metrics           counters + DB rollups
```

`GET /metrics` (counters, rejection counts, per-policy traffic) and
`GET /health` (readiness + policy list) stay public by design.

## 3. Rate limits & quotas

| Plan | Per minute | Per month |
|---|---|---|
| free | 60 | 10k |
| pro | 600 | 500k |
| enterprise | unlimited | unlimited |
| per-IP backstop | 120 | — |
| admin | unlimited | plan quota still applies |

Exceeding returns `429` with `Retry-After` (limits) or a quota message.
Quota counts non-error inference calls in the calendar month. Admins can
override per user (`quota_monthly`, `0` = plan default) from `/admin`.

## 4. Notes & limits

- Request logs store a **PII-scrubbed 300-char preview**, never the raw
  state. Treat the DB as sensitive anyway (row-level content + IPs).
- Usage logging is best-effort: if the DB is down, inference still serves
  (a warning is logged server-side).
- Inference always needs identity: a signed-in session or a `wf_…` key.
  Anonymous calls get `401`. The legacy single master bearer (operator-set)
  still authenticates inference but is **not** a user (platform routes 401
  on it — sign in instead).
- Every response carries `X-Request-ID` — quote it in support requests.
- Tests: `pytest tests/` on [GitHub](https://github.com/manish-9245/Wayfinder).
