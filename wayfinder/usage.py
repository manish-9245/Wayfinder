"""Request-log persistence + metrics aggregations over UsageEvent.

Every inference call (success, 429, 422, 500) appends one row. Dashboards read
the rollups below — no Prometheus needed, but /metrics keeps working for ops.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from wayfinder.config import settings
from wayfinder.hooks import redact_for_log
from wayfinder.models import ApiKey, UsageEvent


def preview_of(state: Any) -> str:
    try:
        raw = state if isinstance(state, str) else json.dumps(state, default=str, ensure_ascii=False)
    except Exception:
        raw = str(state)
    return redact_for_log(raw[: settings.log_state_preview_chars])


def log_usage(
    db: Session,
    *,
    user_id: int | None,
    key_prefix: str | None,
    policy: str,
    verdict: str = "",
    confidence: float | None = None,
    latency_ms: float = 0.0,
    cache_hit: bool = False,
    blocked: bool = False,
    error: bool = False,
    status_code: int = 200,
    ip: str = "",
    state: Any = "",
) -> UsageEvent:
    ev = UsageEvent(
        user_id=user_id,
        key_prefix=key_prefix,
        policy=policy or "",
        verdict=verdict or "",
        confidence=confidence,
        latency_ms=latency_ms,
        cache_hit=cache_hit,
        blocked=blocked,
        error=error,
        status_code=status_code,
        ip=(ip or "")[:64],
        state_preview=preview_of(state),
    )
    db.add(ev)
    # Bump key counters so the keys table doubles as a usage ledger.
    if key_prefix:
        key = db.query(ApiKey).filter(ApiKey.prefix == key_prefix).first()
        if key is not None:
            key.request_count = (key.request_count or 0) + 1
            key.last_used_at = datetime.utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()
    return ev


def _since(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def totals(db: Session, *, user_id: int | None = None, days: int = 30) -> dict[str, Any]:
    # Simple portable aggregation (works on SQLite + Postgres).
    base = db.query(UsageEvent).filter(UsageEvent.created_at >= _since(days))
    if user_id is not None:
        base = base.filter(UsageEvent.user_id == user_id)
    rows = base.all()
    n = len(rows)
    hits = sum(1 for r in rows if r.cache_hit)
    blocks = sum(1 for r in rows if r.blocked)
    errors = sum(1 for r in rows if r.error)
    lat = [r.latency_ms for r in rows if not r.error]
    lat_sorted = sorted(lat)
    p95 = lat_sorted[int(len(lat_sorted) * 0.95)] if lat_sorted else 0.0
    return {
        "requests": n,
        "cache_hits": hits,
        "cache_hit_rate": round(hits / n, 4) if n else 0.0,
        "blocks": blocks,
        "errors": errors,
        "avg_latency_ms": round(sum(lat) / len(lat), 2) if lat else 0.0,
        "p95_latency_ms": round(p95, 2),
    }


def daily_series(db: Session, *, user_id: int | None = None, days: int = 30) -> list[dict[str, Any]]:
    start = _since(days)
    q = db.query(func.date(UsageEvent.created_at), func.count(UsageEvent.id)).filter(UsageEvent.created_at >= start)
    if user_id is not None:
        q = q.filter(UsageEvent.user_id == user_id)
    rows = q.group_by(func.date(UsageEvent.created_at)).order_by(func.date(UsageEvent.created_at)).all()
    by_day = {str(d): int(c) for d, c in rows}
    out = []
    for i in range(days, -1, -1):
        day = (datetime.utcnow() - timedelta(days=i)).date().isoformat()
        out.append({"day": day, "requests": by_day.get(day, 0)})
    return out


def by_policy(db: Session, *, user_id: int | None = None, days: int = 30) -> list[dict[str, Any]]:
    q = db.query(UsageEvent.policy, func.count(UsageEvent.id)).filter(UsageEvent.created_at >= _since(days))
    if user_id is not None:
        q = q.filter(UsageEvent.user_id == user_id)
    return [{"policy": p or "(other)", "requests": int(c)} for p, c in q.group_by(UsageEvent.policy).order_by(func.count(UsageEvent.id).desc()).all()]


def by_verdict(db: Session, *, user_id: int | None = None, days: int = 30) -> list[dict[str, Any]]:
    q = db.query(UsageEvent.verdict, func.count(UsageEvent.id)).filter(UsageEvent.created_at >= _since(days))
    if user_id is not None:
        q = q.filter(UsageEvent.user_id == user_id)
    return [{"verdict": v or "(none)", "requests": int(c)} for v, c in q.group_by(UsageEvent.verdict).all()]


def list_events(
    db: Session,
    *,
    user_id: int | None = None,
    policy: str = "",
    verdict: str = "",
    search: str = "",
    errors_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> tuple[int, list[UsageEvent]]:
    q = db.query(UsageEvent).order_by(UsageEvent.id.desc())
    if user_id is not None:
        q = q.filter(UsageEvent.user_id == user_id)
    if policy:
        q = q.filter(UsageEvent.policy == policy)
    if verdict:
        q = q.filter(UsageEvent.verdict == verdict)
    if errors_only:
        q = q.filter(UsageEvent.error.is_(True))
    if search:
        like = f"%{search}%"
        q = q.filter(UsageEvent.state_preview.like(like))
    total = q.count()
    return total, q.offset(offset).limit(min(max(limit, 1), 200)).all()


def top_users(db: Session, *, days: int = 30, limit: int = 10) -> list[dict[str, Any]]:
    from wayfinder.models import User

    rows = (
        db.query(User.email, User.plan, func.count(UsageEvent.id))
        .join(UsageEvent, UsageEvent.user_id == User.id)
        .filter(UsageEvent.created_at >= _since(days))
        .group_by(User.id, User.email, User.plan)
        .order_by(func.count(UsageEvent.id).desc())
        .limit(limit)
        .all()
    )
    return [{"email": e, "plan": p, "requests": int(c)} for e, p, c in rows]
