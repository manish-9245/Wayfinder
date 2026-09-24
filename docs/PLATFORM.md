# Platform guide: auth, keys, metrics, logs, rate limits, admin

The gateway is now a full platform, not just an inference endpoint:

| Concern | Implementation |
|---|---|
| Identity | **Clerk** (managed: email, OAuth, MFA, orgs). No passwords in this repo |
| Service auth | Per-user `wf_…` API keys (sha256-hashed at rest, shown once) + legacy `WAYFINDER_API_KEY` master bearer |
| Storage | SQLite file by default (`./data/wayfinder.db`); Postgres via `DATABASE_URL` |
| Rate limits | Per-key/user + per-IP sliding windows, tiered by plan (Redis mirrors when set) |
| Quotas | Monthly request caps per plan, customizable per user |
| Logs | One PII-scrubbed row per call (success, 422, 500, 429) |
| Dashboards | `/dashboard` (users), `/admin` (super-admins) in `web/` |

## 1. Local dev (no Clerk, 30 seconds)

```bash
cp .env.example .env
python3 -m venv .venv && .venv/bin/python -m pip install -e .
WAYFINDER_PRELOAD=0 .venv/bin/python -m wayfinder.app  # :8000
cd web && npm install && npm run dev                    # :3000
```

With no Clerk keys set, the gateway auto-provisions a `dev-admin`
(`admin@local.dev`, enterprise plan). Open `/dashboard` — everything works
keyless. Create a `wf_…` key and the console uses it automatically.

## 2. Clerk setup (staging / production)

1. Create an application at [clerk.com](https://clerk.com) (email + the OAuth
   providers you want; MFA optional, recommended for admins).
2. Copy keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → gateway env **and** web env
   - `CLERK_SECRET_KEY` → gateway env **and** web env
3. Find the JWKS URL: Clerk Dashboard → API Keys → “JWKS URL”
   (`https://<instance>.clerk.accounts.dev/.well-known/jwks.json`).
4. Gateway env:
   ```bash
   CLERK_ENABLED=1
   CLERK_JWKS_URL=https://<instance>.clerk.accounts.dev/.well-known/jwks.json
   CLERK_ISSUER=https://<instance>.clerk.accounts.dev
   CLERK_SECRET_KEY=sk_live_...
   WAYFINDER_SUPERADMINS=you@company.com,cto@company.com
   ```
5. Web env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
   Rebuild web after changing the publishable key (it is inlined at build).

How it works: the browser gets a Clerk session JWT; `lib/platform.ts`
attaches it as `Authorization: Bearer …` on every `/api/v1/*` call. The
gateway verifies RS256 against the JWKS, mirrors the user into its own
`users` table (role/plan/quota live there, identity in Clerk), and every
inference call is attributed. Super-admin = DB `role=admin`, or email in
`WAYFINDER_SUPERADMINS`, or Clerk `org_role=admin`.

## 3. Railway deploy

- Gateway service: Dockerfile at repo root, healthcheck `/health`.
  Add a Postgres plugin and set `DATABASE_URL` (or keep the `app-data`
  volume on SQLite for small scale). Set the Clerk vars above.
- Web service: Dockerfile at `web/`, needs `WAYFINDER_API_URL` (internal
  gateway URL), both Clerk keys, `NEXT_PUBLIC_SITE_URL`.
- Redis plugin (optional, recommended past 1 replica): `WAYFINDER_REDIS_URL`.

## 4. API reference (platform)

All JSON. User routes accept a Clerk JWT **or** a `wf_…` key. Admin routes
need `role=admin` (a `wf_…` key of an admin works for scripts).

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
GET    /v1/admin/system            router, policies, cache, redis, db, clerk, limits, quotas
GET    /v1/admin/metrics           Prometheus-style counters + DB rollups
```

`GET /metrics` (unauthenticated, Prometheus-friendly) and `GET /health`
keep working exactly as before.

## 5. Rate limits & quotas

| Plan | Per minute | Per month |
|---|---|---|
| free | 60 (`WAYFINDER_RATE_FREE_PER_MIN`) | 10k (`WAYFINDER_QUOTA_FREE`) |
| pro | 600 (`WAYFINDER_RATE_PRO_PER_MIN`) | 500k (`WAYFINDER_QUOTA_PRO`) |
| enterprise | unlimited | unlimited |
| per-IP backstop | 120 (`WAYFINDER_RATE_IP_PER_MIN`) | — |
| admin | unlimited | plan quota still applies |

Exceeding returns `429` with `Retry-After` (limits) or a quota message.
Quota counts non-error inference calls in the calendar month. Admins can
override per user (`quota_monthly`, `0` = plan default) from `/admin`.

## 6. Notes & limits

- Request logs store a **PII-scrubbed 300-char preview**, never the raw
  state. Treat the DB as sensitive anyway (row-level content + IPs).
- Usage logging is best-effort: if the DB is down, inference still serves
  (a warning is logged server-side).
- Legacy behavior preserved: with no Clerk and no `WAYFINDER_API_KEY`,
  inference is open (dev). With `WAYFINDER_API_KEY` set, the master bearer
  still authenticates inference but is **not** a user (platform routes 401
  on it — sign in instead).
- Tests: `pytest tests/` — `test_platform.py` runs keys/RBAC/limits/quota/
  logs against a tmp SQLite DB with stubbed auth; no torch, no network.
