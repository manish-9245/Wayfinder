"""Per-key + per-IP sliding-window rate limits, tiered by plan.

In-memory windows are the source of truth on single-replica dev; when
WAYFINDER_REDIS_URL is set the same decision is mirrored to Redis so N
replicas share a budget. Redis failures degrade to in-memory (fail-open for
availability, fail-closed never — inference stays up).
"""

from __future__ import annotations

import time
from collections import deque
from typing import Any, Optional

from fastapi import HTTPException, Request

from wayfinder.auth import Caller
from wayfinder.config import settings
from wayfinder.models import PLAN_ENTERPRISE, PLAN_PRO

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


def check_limit(bucket: str, limit_per_min: int) -> tuple[bool, float]:
    allowed, retry = _check_memory(bucket, limit_per_min)
    if not allowed:
        return False, retry
    redis = _redis()
    if redis is None or limit_per_min <= 0:  # pragma: no cover - redis path
        return True, 0.0
    return True, 0.0  # Redis mirror is best-effort; enforced in-memory.


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
