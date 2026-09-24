"""Single source of truth for all runtime configuration.

Every knob is an env var so the same image serves a laptop dev run,
a Docker Compose stack, and a Kubernetes Deployment with zero code change.

Scalability notes:
- WORKERS: torch inference is NOT fork-safe for multi-worker preload in one
  process image on some platforms. Scale by adding containers (replicas),
  not by raising uvicorn --workers with preload. The Helm/compose default
  is 1 worker per pod with HPA on p95 latency.
- LAYA_THREADS: cap torch intra-op threads at or below physical cores.
  Oversubscribing logical/hyperthread cores is a large CPU regression.
- PRELOAD=true at boot removes the 2-7s cold checkpoint build from the
  request path. Gate readiness (/health returns ready) only after preload.
"""

from __future__ import annotations

import os


def _env_bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


class Settings:
    host: str = os.getenv("WAYFINDER_HOST", "127.0.0.1")
    port: int = _env_int("WAYFINDER_PORT", 8000)
    # --- model plane (passed straight to laya.Router) ---
    device: str | None = os.getenv("LAYA_DEVICE") or None
    preload: bool = _env_bool("WAYFINDER_PRELOAD", True)
    models: str = os.getenv("LAYA_MODELS", "english,multilingual")  # csv; typed-decisions stays lazy unless named
    max_loaded: int = _env_int("LAYA_MAX_LOADED", 2)
    threads: int | None = int(os.environ["LAYA_THREADS"]) if os.environ.get("LAYA_THREADS") else None
    # --- access ---
    api_key: str = os.getenv("WAYFINDER_API_KEY", "")  # empty = no auth (dev); set in prod
    # Reject anonymous inference even when no master key / SuperTokens core is
    # configured. Identity = SuperTokens session, wf_ service key, master
    # bearer, or WAYFINDER_TEST_AUTH backdoor. Default off so the OSS
    # quickstart and no-weights CI stay zero-config; enable in any deployment
    # that serves untrusted clients.
    require_auth: bool = _env_bool("WAYFINDER_REQUIRE_AUTH", False)
    # --- safety rails (mirror laya/serve.py so one mental model covers both) ---
    max_questions: int = _env_int("WAYFINDER_MAX_QUESTIONS", 64)
    max_state_chars: int = _env_int("WAYFINDER_MAX_STATE_CHARS", 50000)
    max_body_bytes: int = _env_int("WAYFINDER_MAX_BODY_BYTES", 2 * 1024 * 1024)
    # --- cache ---
    cache_size: int = _env_int("WAYFINDER_CACHE_SIZE", 2048)  # in-memory LRU entries; 0 = off
    redis_url: str = os.getenv("WAYFINDER_REDIS_URL", "")  # empty = no redis; set to share cache across replicas
    # --- misc ---
    policies_file: str = os.getenv("WAYFINDER_POLICIES", "wayfinder/policies.yaml")
    log_level: str = os.getenv("WAYFINDER_LOG_LEVEL", "info")
    # --- platform: database (SQLite file by default, Postgres via DATABASE_URL) ---
    database_url: str = os.getenv("WAYFINDER_DATABASE_URL", "") or os.getenv("DATABASE_URL", "") or "sqlite:///./data/wayfinder.db"
    # --- platform: SuperTokens managed auth (self-hosted core, no passwords here) ---
    supertokens_enabled: bool = _env_bool("SUPERTOKENS_ENABLED", False)
    supertokens_connection_uri: str = os.getenv("SUPERTOKENS_CONNECTION_URI", "http://localhost:3568")
    supertokens_api_key: str = os.getenv("SUPERTOKENS_API_KEY", "")
    supertokens_api_domain: str = os.getenv("SUPERTOKENS_API_DOMAIN", "http://127.0.0.1:8000")
    supertokens_website_domain: str = os.getenv("SUPERTOKENS_WEBSITE_DOMAIN", "http://localhost:3000")
    # OAuth clients (optional; provider is skipped when its pair is unset).
    google_client_id: str = os.getenv("THIRD_PARTY_GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("THIRD_PARTY_GOOGLE_CLIENT_SECRET", "")
    github_client_id: str = os.getenv("THIRD_PARTY_GITHUB_CLIENT_ID", "")
    github_client_secret: str = os.getenv("THIRD_PARTY_GITHUB_CLIENT_SECRET", "")
    superadmin_emails: str = os.getenv("WAYFINDER_SUPERADMINS", "")  # csv; always admin
    # --- platform: rate limits (per minute) + monthly quotas by plan ---
    rate_free_per_min: int = _env_int("WAYFINDER_RATE_FREE_PER_MIN", 60)
    rate_pro_per_min: int = _env_int("WAYFINDER_RATE_PRO_PER_MIN", 600)
    rate_enterprise_per_min: int = _env_int("WAYFINDER_RATE_ENTERPRISE_PER_MIN", 0)  # 0 = unlimited
    rate_ip_per_min: int = _env_int("WAYFINDER_RATE_IP_PER_MIN", 120)
    rate_admin_per_min: int = _env_int("WAYFINDER_RATE_ADMIN_PER_MIN", 0)  # 0 = unlimited
    quota_free_monthly: int = _env_int("WAYFINDER_QUOTA_FREE", 10_000)
    quota_pro_monthly: int = _env_int("WAYFINDER_QUOTA_PRO", 500_000)
    quota_enterprise_monthly: int = _env_int("WAYFINDER_QUOTA_ENTERPRISE", 0)  # 0 = unlimited
    # --- platform: request log retention ---
    log_state_preview_chars: int = _env_int("WAYFINDER_LOG_PREVIEW_CHARS", 300)
    # --- test/dev escape hatch (never enable in prod) ---
    test_auth: bool = _env_bool("WAYFINDER_TEST_AUTH", False)


settings = Settings()
