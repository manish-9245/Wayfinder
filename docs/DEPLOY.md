# Deploy

Wayfinder is two services behind two domains:

| Service | Host | Source |
|---|---|---|
| `wayfinder` (FastAPI gateway, API only) | `https://wayfinder-backend.buildwithmanish.com` | repo root `Dockerfile` |
| `wayfinder-web` (Next.js frontend, the only UI) | `https://wayfinder.buildwithmanish.com` | `web/` dir, `web/Dockerfile` |

Sign in on the site, create a `wf_…` key in the dashboard, and call the
[API](API.md) or [MCP](MCP.md) endpoint. No install, no weights, no ops.

## How shipping works here

- GitHub auto-deploy is **off**. Deploys go out via the Railway CLI:
  `railway up` from the repo root for the gateway (`wayfinder` service),
  `railway up` from `web/` for the frontend (`wayfinder-web` service).
- `wayfinder-web` builds with **Root Directory `web`** and Dockerfile Path
  `Dockerfile`. If it ever builds the Python image, this setting drifted —
  the symptom is the frontend domain serving the gateway JSON map.

## Production env (gateway)

- `WAYFINDER_DOCS=0` — hides Swagger UI, ReDoc, and `/openapi.json`.
  Local keeps them on for DX.
- `WAYFINDER_REQUIRE_AUTH=1`, `WAYFINDER_API_KEY`, quotas, and SuperTokens
  vars per the [runbook on GitHub](https://github.com/manish-9245/Wayfinder).

## Production env (frontend)

- `WAYFINDER_API_URL=http://wayfinder.railway.internal:8000`
  — server-to-server over Railway private networking. This pairs with a
  pinned `PORT=8000` on the gateway service: Railway reassigns `PORT` on
  every redeploy, so an unpinned gateway drifts ports and breaks this URL.
  (A `${{wayfinder.PORT}}` reference resolves empty — do not use it.)
  Never point this at the public backend URL: Cloudflare bot protection
  403s datacenter fetchers, and you would pay an extra public hop.
- `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_WEBSITE_DOMAIN` =
  `https://wayfinder.buildwithmanish.com`.

## Domains & TLS (Cloudflare)

- Both hostnames are proxied CNAMEs to their Railway targets. TLS is the
  zone Universal cert, whose `*.buildwithmanish.com` wildcard covers
  **one level only** — nested subdomains like `backend.wayfinder.*` get no
  edge cert and fail TLS. Keep all hostnames single-level.
- To move a custom domain between Railway services: remove it from the old
  service first (dashboard; the CLI cannot remove domains), then
  `railway domain <host>` on the new one and point the CNAME at the
  returned target.

## Getting the most out of hosted

- [ ] Batch background workloads via `/predict/batch` (≤128 states/call).
- [ ] Watch `/metrics` (hit rate < 20% on repeated traffic = key bug on your side).
- [ ] Tune per-call thresholds (`auto_act_above`, `escalate_below`) after one
      week of escalation labels — start at 0.85/0.60.
- [ ] Pin `model` only when you know better than the router; omit it otherwise.
- [ ] Quote `X-Request-ID` response headers in support requests.
