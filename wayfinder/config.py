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


settings = Settings()
