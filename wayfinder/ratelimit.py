"""Per-key + per-IP sliding-window rate limits, tiered by plan.

Two layers, in this order:

1. Redis fixed-window counters (only when WAYFINDER_REDIS_URL is set) — the
   source of truth across replicas. One INCR (+EXPIRE on first hit) per
   bucket per request; any Redis failure degrades to layer 2 and bumps the
   `redis_errors` metric (fail-open for availability, never fail-closed).
2. In-memory sliding windows — exact on single-replica dev, best-effort
   per-replica when Redis is down.

Bucket keys are namespaced `wf:rl:{bucket}:{minute}` with a 65s TTL so dead
windows evaporate on their own.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from typing import Any, Optional

from fastapi import HTTPException, Request

from wayfinder.auth import Caller
from wayfinder.config import settings
from wayfinder.hooks import record_redis_error
from wayfinder.models import PLAN_ENTERPRISE, PLAN_PRO

log = logging.getLogger("wayfinder")

_WINDOWS: dict[str, deque[float]] = {}


def reset_windows() -> None:
    _WINDOWS.clear()


def _redis():
    try:
        import wayfinder.app as appmod

        return getattr(appmod, "REDIS", None)
    except Exception:
        return None


def plan_limit_per_min(user: Any = None, is_admin: bool = False) -> int:
    if is_admin and settings.rate_admin_per_min == 0:
        return 0
    plan = (getattr(user, "plan", None) or "free") if user else "free"
    if plan == PLAN_ENTERPRISE:
        return settings.rate_enterprise_per_min
    if plan == PLAN_PRO:
        return settings.rate_pro_per_min
    return settings.rate_free_per_min


def _check_memory(bucket: str, limit_per_min: int) -> tuple[bool, float]:
    if limit_per_min <= 0:
        return True, 0.0
    now = time.time()
    dq = _WINDOWS.setdefault(bucket, deque())
    while dq and now - dq[0] >= 60.0:
        dq.popleft()
    if len(dq) >= limit_per_min:
        return False, max(0.0, 60.0 - (now - dq[0]))
    dq.append(now)
    return True, 0.0


def _check_redis(bucket: str, limit_per_min: int) -> tuple[bool, float] | None:
    """Shared fixed-window counter. Returns None when Redis is unconfigured
    or fails (caller falls back to memory); otherwise (allowed, retry_secs)."""
    redis = _redis()
    if redis is None or limit_per_min <= 0:
        return None
    try:
        window = int(time.time() // 60)
        key = f"wf:rl:{bucket}:{window}"
        count = int(redis.incr(key))
        if count == 1:
            redis.expire(key, 65)
        if count <= limit_per_min:
            return True, 0.0
        try:
            ttl = redis.ttl(key)
        except Exception:
            ttl = -1
        retry = float(ttl) if isinstance(ttl, (int, float)) and ttl > 0 else 60.0
        return False, retry
    except Exception as exc:  # fail open; the metric (not the log) is the signal
        record_redis_error()
        log.debug("redis rate-limit fallback (%s)", exc)
        return None


def check_limit(bucket: str, limit_per_min: int) -> tuple[bool, float]:
    if limit_per_min <= 0:
        return True, 0.0
    shared = _check_redis(bucket, limit_per_min)
    if shared is not None:
        return shared
    return _check_memory(bucket, limit_per_min)


def enforce_rate_limit(request: Request, caller: Caller) -> None:
    ip = request.client.host if request.client else ""
    # 1) Per-IP guard always applies (DDoS backstop).
    ok, retry = check_limit(f"ip:{ip}", settings.rate_ip_per_min)
    if not ok:
        raise HTTPException(status_code=429, detail=f"too many requests from this IP; retry in {retry:.0f}s",
                            headers={"Retry-After": str(int(retry) + 1)})
    # 2) Per-identity guard: key prefix > user > (anonymous IP already covered).
    limit = plan_limit_per_min(caller.user, is_admin=bool(caller.user and caller.user.role == "admin"))
    if limit <= 0:
        return
    bucket = f"key:{caller.key_prefix}" if caller.key_prefix else (
        f"user:{caller.user.id}" if caller.user else f"anon:{ip}")
    ok, retry = check_limit(bucket, limit)
    if not ok:
        raise HTTPException(status_code=429, detail=f"rate limit exceeded ({limit}/min); retry in {retry:.0f}s",
                            headers={"Retry-After": str(int(retry) + 1)})


def monthly_quota(user: Any) -> Optional[int]:
    if user is None:
        return None
    if getattr(user, "quota_monthly", None) is not None:
        return user.quota_monthly
    plan = getattr(user, "plan", "free")
    mapping = {"free": settings.quota_free_monthly, "pro": settings.quota_pro_monthly, "enterprise": settings.quota_enterprise_monthly}
    q = mapping.get(plan, settings.quota_free_monthly)
    return None if q == 0 else q


def enforce_quota(db: Any, user: Any) -> None:
    from datetime import datetime

    from wayfinder.models import UsageEvent

    quota = monthly_quota(user)
    if user is None or quota is None:
        return
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = db.query(UsageEvent).filter(UsageEvent.user_id == user.id, UsageEvent.created_at >= start,
                                       UsageEvent.error.is_(False)).count()
    if used >= quota:
        raise HTTPException(status_code=429, detail=f"monthly quota exhausted ({used}/{quota}); upgrade plan or contact admin")
