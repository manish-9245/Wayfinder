# Platform guide: auth, keys, metrics, logs, rate limits, admin

The gateway is now a full platform, not just an inference endpoint:

| Concern | Implementation |
|---|---|
| Identity | **Self-hosted SuperTokens core** (email/password + optional Google/GitHub OAuth, UserRoles). No passwords in this repo |
| Service auth | Per-user `wf_…` API keys (sha256-hashed at rest, shown once) + legacy `WAYFINDER_API_KEY` master bearer |
| Storage | SQLite file by default (`./data/wayfinder.db`); Postgres via `DATABASE_URL` |
| Rate limits | Per-key/user + per-IP sliding windows, tiered by plan (Redis mirrors when set) |
| Quotas | Monthly request caps per plan, customizable per user |
| Logs | One PII-scrubbed row per call (success, 422, 500, 429) |
| Dashboards | `/dashboard` (users), `/admin` (super-admins) in `web/` |

## 1. Local dev (no core, 30 seconds)

```bash
cp .env.example .env
python3 -m venv .venv && .venv/bin/python -m pip install -e .
WAYFINDER_PRELOAD=0 .venv/bin/python -m wayfinder.app  # :8000
cd web && npm install && cp .env.example .env.local && npm run dev  # :3000
```

With no SuperTokens core configured, the gateway auto-provisions a `dev-admin`
(`admin@local.dev`, enterprise plan). Set `NEXT_PUBLIC_AUTH_DISABLED=1` in
`web/.env.local` and open `/dashboard` — everything works keyless. Create a
`wf_…` key and the console uses it automatically.

## 2. SuperTokens setup (staging / production)

You run the core (this repo assumes the Railway `supertokens-core` template
backed by Postgres; any reachable core works).

1. Deploy the SuperTokens core and note its connection URI + API key (if set).
2. Gateway env:
   ```bash
   SUPERTOKENS_ENABLED=1
   SUPERTOKENS_CONNECTION_URI=http://supertokens-core.railway.internal:3567
   SUPERTOKENS_API_KEY=            # only if the core enforces one
   SUPERTOKENS_API_DOMAIN=https://<gateway-public-url>
   SUPERTOKENS_WEBSITE_DOMAIN=https://<web-public-url>
   DATABASE_URL=${{Postgres.DATABASE_URL}}   # platform tables live in Postgres
   WAYFINDER_SUPERADMINS=you@company.com
   ```
3. Web env (all `NEXT_PUBLIC_*` are inlined at build — rebuild after changing):
   ```bash
   NEXT_PUBLIC_WEBSITE_DOMAIN=https://<web-public-url>
   # NEXT_PUBLIC_AUTH_DISABLED must be UNSET (any value disables sign-in)
   # NEXT_PUBLIC_OAUTH_PROVIDERS=google,github  # after step 4
   ```
4. Social login (optional): create OAuth apps in Google / GitHub consoles with
   redirect URI `https://<gateway-public-url>/auth/callback/<google|github>`,
   then set `THIRD_PARTY_GOOGLE_CLIENT_ID/_SECRET` (and/or GitHub) on the
   gateway **and** `NEXT_PUBLIC_OAUTH_PROVIDERS=google,github` on web.

How it works: the browser only talks to the web origin. `/api/auth/*` is
proxied to the gateway's `/auth/*`, so session cookies stay first-party —
no CORS or third-party-cookie pitfalls. The gateway verifies sessions
against the core, mirrors each user into its own `users` table (role/plan/
quota live there, identity in SuperTokens), and attributes every inference
call. Super-admin = DB `role=admin`, or email in `WAYFINDER_SUPERADMINS`,
or the SuperTokens UserRoles `admin` role.

## 3. Railway deploy

- Gateway service (`wayfinder`): Dockerfile at repo root, healthcheck `/health`.
  - Postgres plugin → reference `DATABASE_URL=${{Postgres.DATABASE_URL}}`
    (platform tables auto-created on boot; replaces the ephemeral SQLite file).
  - Volume `wayfinder-volume` at `/app/data` + `HF_HOME=/app/data/huggingface`
    (SQLite fallback + model cache survive redeploys).
  - Redis plugin → `WAYFINDER_REDIS_URL=${{Redis.REDIS_URL}}` (shared cache
    past 1 replica).
  - SuperTokens vars from §2 (`SUPERTOKENS_ENABLED=1`, connection URI,
    both public domains, `WAYFINDER_SUPERADMINS`).
- Web service (`wayfinder-web`): Dockerfile at `web/`, needs
  `WAYFINDER_API_URL` (internal gateway URL for the `/api/*` proxy),
  `NEXT_PUBLIC_WEBSITE_DOMAIN` (public web origin, inlined at build),
  `NEXT_PUBLIC_SITE_URL`. Leave `NEXT_PUBLIC_AUTH_DISABLED` unset.
- Deploy with the CLI for deterministic source (learned the hard way):
  - gateway: `railway up -s wayfinder` from the repo root (GitHub-triggered
    builds can snapshot a stale commit).
  - web: `railway up --path-as-root web -s wayfinder-web` from the repo root
    (a bare `railway up` archives the repo root and builds the gateway image).
- No SMTP is configured on the core: sign-up works, but password-reset
  emails will not send until you add an SMTP server to SuperTokens.

## 4. API reference (platform)

All JSON. User routes accept a SuperTokens session cookie **or** a `wf_…`
key. Admin routes need `role=admin` (a `wf_…` key of an admin works for scripts).

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
- Legacy behavior preserved: with no SuperTokens core and no `WAYFINDER_API_KEY`,
  inference is open (dev). With `WAYFINDER_API_KEY` set, the master bearer
  still authenticates inference but is **not** a user (platform routes 401
  on it — sign in instead).
- Tests: `pytest tests/` — `test_platform.py` runs keys/RBAC/limits/quota/
  logs against a tmp SQLite DB with stubbed auth; no torch, no network.
