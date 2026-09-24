"""Platform API: API keys, self-service usage/logs, super-admin console.

Auth: SuperTokens session cookie (or wf_ key for /v1/me + /v1/keys reads).
When SUPERTOKENS_ENABLED=0 a dev-admin is auto-provisioned so local
dashboards work. Every route here requires an authenticated user; /v1/admin/*
additionally requires role == admin.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from wayfinder import usage as usage_store
from wayfinder.auth import get_current_user, hash_key, new_raw_key, require_admin
from wayfinder.config import settings
from wayfinder.db import get_db
from wayfinder.models import PLANS, ApiKey, UsageEvent, User
from wayfinder.ratelimit import monthly_quota, plan_limit_per_min
from wayfinder.schemas import (
    AdminKeyOut,
    KeyCreate,
    KeyCreated,
    KeyOut,
    LogOut,
    MeOut,
    PagedLogs,
    UsageOut,
    UserOut,
    UserPatch,
)

keys_router = APIRouter(prefix="/v1/keys", tags=["keys"])
me_router = APIRouter(prefix="/v1/me", tags=["me"])
admin_router = APIRouter(prefix="/v1/admin", tags=["admin"])

MAX_KEYS_PER_USER = 10


def _key_out(k: ApiKey) -> KeyOut:
    return KeyOut(id=k.id, name=k.name, prefix=k.prefix, is_active=k.is_active,
                  request_count=k.request_count or 0, last_used_at=k.last_used_at, created_at=k.created_at)


def _month_used(db: Session, user_id: int) -> int:
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return db.query(UsageEvent).filter(UsageEvent.user_id == user_id,
                                       UsageEvent.created_at >= start,
                                       UsageEvent.error.is_(False)).count()


# ---------------------------------------------------------------- keys --- #

@keys_router.post("", response_model=KeyCreated, status_code=201)
def create_key(body: KeyCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(ApiKey).filter(ApiKey.user_id == user.id, ApiKey.is_active.is_(True)).count()
    if existing >= MAX_KEYS_PER_USER:
        raise HTTPException(status_code=429, detail=f"max {MAX_KEYS_PER_USER} active keys per user")
    raw, prefix = new_raw_key()
    # Extremely unlikely prefix collision — retry once instead of 500ing.
    if db.query(ApiKey).filter(ApiKey.prefix == prefix).first():
        raw, prefix = new_raw_key()
    row = ApiKey(user_id=user.id, name=(body.name or "default")[:120], prefix=prefix, key_hash=hash_key(raw))
    db.add(row)
    db.commit()
    db.refresh(row)
    out = _key_out(row)
    return KeyCreated(**out.model_dump(), key=raw)


@keys_router.get("", response_model=list[KeyOut])
def list_keys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(ApiKey).filter(ApiKey.user_id == user.id).order_by(ApiKey.id.desc()).all()
    return [_key_out(r) for r in rows]


@keys_router.delete("/{prefix}", status_code=204)
def revoke_key(prefix: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(ApiKey).filter(ApiKey.prefix == prefix, ApiKey.user_id == user.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="key not found")
    row.is_active = False
    db.commit()
    return None


# ----------------------------------------------------------------- me --- #

@me_router.get("", response_model=MeOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return MeOut(id=user.id, email=user.email, role=user.role, plan=user.plan,
                 quota_monthly=monthly_quota(user), quota_used=_month_used(db, user.id),
                 rate_per_min=plan_limit_per_min(user, is_admin=user.role == "admin"),
                 created_at=user.created_at)


@me_router.get("/usage", response_model=UsageOut)
def my_usage(days: int = Query(default=30, ge=1, le=365),
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return UsageOut(totals=usage_store.totals(db, user_id=user.id, days=days),
                    daily=usage_store.daily_series(db, user_id=user.id, days=days),
                    by_policy=usage_store.by_policy(db, user_id=user.id, days=days),
                    by_verdict=usage_store.by_verdict(db, user_id=user.id, days=days),
                    quota_monthly=monthly_quota(user), quota_used=_month_used(db, user.id))


@me_router.get("/logs", response_model=PagedLogs)
def my_logs(policy: str = "", verdict: str = "", search: str = "", errors_only: bool = False,
            limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total, rows = usage_store.list_events(db, user_id=user.id, policy=policy, verdict=verdict,
                                          search=search, errors_only=errors_only, limit=limit, offset=offset)
    return PagedLogs(total=total, logs=[_log_out(r, user.email) for r in rows])


def _log_out(r: UsageEvent, email: str = "") -> LogOut:
    return LogOut(id=r.id, created_at=r.created_at, user_id=r.user_id, email=email,
                  key_prefix=r.key_prefix, policy=r.policy, verdict=r.verdict, confidence=r.confidence,
                  latency_ms=r.latency_ms, cache_hit=r.cache_hit, blocked=r.blocked, error=r.error,
                  status_code=r.status_code, ip=r.ip or "", state_preview=r.state_preview)


# -------------------------------------------------------------- admin --- #

@admin_router.get("/overview")
def overview(days: int = Query(default=30, ge=1, le=365),
             admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"totals": usage_store.totals(db, days=days),
            "daily": usage_store.daily_series(db, days=days),
            "by_policy": usage_store.by_policy(db, days=days),
            "by_verdict": usage_store.by_verdict(db, days=days),
            "top_users": usage_store.top_users(db, days=days),
            "counts": {"users": db.query(User).count(),
                       "users_active": db.query(User).filter(User.is_active.is_(True)).count(),
                       "keys": db.query(ApiKey).count(),
                       "keys_active": db.query(ApiKey).filter(ApiKey.is_active.is_(True)).count()}}


@admin_router.get("/users")
def list_users(search: str = "", limit: int = Query(default=50, ge=1, le=200),
               offset: int = Query(default=0, ge=0),
               admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(User).order_by(User.id.desc())
    if search:
        like = f"%{search}%"
        q = q.filter(User.email.like(like))
    total = q.count()
    rows = q.offset(offset).limit(limit).all()
    since = datetime.utcnow() - timedelta(days=30)
    out: list[UserOut] = []
    for u in rows:
        keys_count = db.query(ApiKey).filter(ApiKey.user_id == u.id).count()
        reqs = db.query(UsageEvent).filter(UsageEvent.user_id == u.id, UsageEvent.created_at >= since).count()
        out.append(UserOut(id=u.id, email=u.email, role=u.role, plan=u.plan, quota_monthly=u.quota_monthly,
                           is_active=u.is_active, created_at=u.created_at, keys_count=keys_count, requests_30d=reqs))
    return {"total": total, "users": out}


@admin_router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(user_id: int, patch: UserPatch,
               admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="user not found")
    if patch.role is not None:
        if patch.role not in ("user", "admin"):
            raise HTTPException(status_code=422, detail="role must be user|admin")
        if u.id == admin.id and patch.role != "admin":
            raise HTTPException(status_code=422, detail="cannot demote yourself")
        u.role = patch.role
    if patch.plan is not None:
        if patch.plan not in PLANS:
            raise HTTPException(status_code=422, detail=f"plan must be one of {list(PLANS)}")
        u.plan = patch.plan
    if patch.quota_monthly is not None:
        if patch.quota_monthly < 0:
            raise HTTPException(status_code=422, detail="quota must be >= 0 (0 key quota means use plan default)")
        u.quota_monthly = patch.quota_monthly or None  # 0 resets to plan default
    if patch.is_active is not None:
        if u.id == admin.id and patch.is_active is False:
            raise HTTPException(status_code=422, detail="cannot disable yourself")
        u.is_active = patch.is_active
    db.commit()
    db.refresh(u)
    keys_count = db.query(ApiKey).filter(ApiKey.user_id == u.id).count()
    return UserOut(id=u.id, email=u.email, role=u.role, plan=u.plan, quota_monthly=u.quota_monthly,
                   is_active=u.is_active, created_at=u.created_at, keys_count=keys_count, requests_30d=0)


@admin_router.get("/keys")
def list_all_keys(search: str = "", limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(ApiKey, User.email).join(User, User.id == ApiKey.user_id).order_by(ApiKey.id.desc())
    if search:
        like = f"%{search}%"
        q = q.filter((ApiKey.prefix.like(like)) | (User.email.like(like)) | (ApiKey.name.like(like)))
    total = q.count()
    out = [AdminKeyOut(**_key_out(k).model_dump(), user_id=k.user_id, email=e) for k, e in q.offset(offset).limit(limit).all()]
    return {"total": total, "keys": out}


@admin_router.delete("/keys/{prefix}", status_code=204)
def admin_revoke_key(prefix: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.query(ApiKey).filter(ApiKey.prefix == prefix).first()
    if row is None:
        raise HTTPException(status_code=404, detail="key not found")
    row.is_active = False
    db.commit()
    return None


@admin_router.get("/logs", response_model=PagedLogs)
def admin_logs(policy: str = "", verdict: str = "", search: str = "", errors_only: bool = False,
               user_id: int = 0, limit: int = Query(default=50, ge=1, le=200),
               offset: int = Query(default=0, ge=0),
               admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    total, rows = usage_store.list_events(db, user_id=user_id or None, policy=policy, verdict=verdict,
                                          search=search, errors_only=errors_only, limit=limit, offset=offset)
    emails = {u.id: u.email for u in db.query(User).filter(User.id.in_([r.user_id for r in rows if r.user_id])).all()} if rows else {}
    return PagedLogs(total=total, logs=[_log_out(r, emails.get(r.user_id or 0, "")) for r in rows])


@admin_router.get("/system")
def system(admin: User = Depends(require_admin)):
    import wayfinder.app as appmod

    return {"status": "ready" if appmod.ROUTER is not None else "loading",
            "policies": sorted(appmod.POLICIES),
            "cache_entries": len(appmod.CACHE),
            "redis": appmod.REDIS is not None,
            "db": _db_ok(),
            "auth_provider": "supertokens",
            "auth_enabled": settings.supertokens_enabled,
            "limits_per_min": {"free": settings.rate_free_per_min, "pro": settings.rate_pro_per_min,
                               "enterprise": settings.rate_enterprise_per_min or "unlimited",
                               "ip": settings.rate_ip_per_min,
                               "admin": settings.rate_admin_per_min or "unlimited"},
            "quotas_monthly": {"free": settings.quota_free_monthly, "pro": settings.quota_pro_monthly,
                               "enterprise": settings.quota_enterprise_monthly or "unlimited"}}


def _db_ok() -> bool:
    try:
        from sqlalchemy import text

        from wayfinder.db import engine

        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@admin_router.get("/metrics")
def admin_metrics(days: int = Query(default=30, ge=1, le=365),
                  admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Prometheus-style global counters plus DB rollups (scrape-friendly JSON)."""
    from wayfinder.hooks import metrics_snapshot

    snap = metrics_snapshot()
    snap["db"] = usage_store.totals(db, days=days)
    snap["by_policy"] = usage_store.by_policy(db, days=days)
    return snap
