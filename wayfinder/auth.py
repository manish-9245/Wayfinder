"""Managed auth via Clerk (no custom passwords anywhere).

- Browser: Next.js uses @clerk/nextjs; the session JWT is sent as
  `Authorization: Bearer <clerk-jwt>` to the gateway.
- Gateway: verifies the JWT against Clerk's JWKS (RS256), then mirrors the
  user into the local DB (role/plan/quota live here, identity lives in Clerk).
- Service keys: per-user `wf_…` API keys (sha256-hashed at rest) for curl /
  server-to-server use, plus the legacy WAYFINDER_API_KEY master bearer.
- Inference endpoints accept (in order): master key → Clerk JWT → wf_ key →
  open (only when nothing is configured, i.e. local dev).

Super-admin = DB role `admin` OR email in WAYFINDER_SUPERADMINS OR Clerk
`org_role == 'admin'`. When CLERK_ENABLED=0 (local dev without Clerk keys),
a `dev-admin` user is auto-provisioned so dashboards keep working.
"""

from __future__ import annotations

import hashlib
import secrets
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx
import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from wayfinder.config import settings
from wayfinder.db import get_db
from wayfinder.models import ROLE_ADMIN, ApiKey, User

_JWKS_CLIENT: Any = None
_JWKS_URL_CACHED = ""


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def new_raw_key() -> tuple[str, str]:
    """Returns (raw_secret, prefix). Raw is shown once, never stored."""
    raw = "wf_" + secrets.token_urlsafe(32)
    return raw, raw[:11]


def _jwks_client() -> Any:
    global _JWKS_CLIENT, _JWKS_URL_CACHED
    if not settings.clerk_jwks_url:
        raise HTTPException(status_code=500, detail="CLERK_JWKS_URL is not configured")
    if _JWKS_CLIENT is None or _JWKS_URL_CACHED != settings.clerk_jwks_url:
        _JWKS_CLIENT = jwt.PyJWKClient(settings.clerk_jwks_url, cache_keys=True, max_cached_keys=8)
        _JWKS_URL_CACHED = settings.clerk_jwks_url
    return _JWKS_CLIENT


def verify_clerk_token(token: str) -> dict[str, Any]:
    """Verify a Clerk session JWT and return its claims. Raises 401."""
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"invalid session token: {exc}") from exc
    try:
        decode_kw: dict[str, Any] = {"key": signing_key.key, "algorithms": ["RS256"], "options": {"verify_aud": False}}
        if settings.clerk_issuer:
            decode_kw["issuer"] = settings.clerk_issuer
        else:
            decode_kw["options"]["verify_iss"] = False
        return jwt.decode(token, **decode_kw)
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="session token expired") from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"invalid session token: {exc}") from exc


def _clerk_email(claims: dict[str, Any], sub: str) -> str:
    for key in ("email", "email_address", "primary_email"):
        v = claims.get(key)
        if isinstance(v, str) and "@" in v:
            return v.lower()
    # Clerk session tokens don't carry email by default; try Backend API.
    if settings.clerk_secret_key:
        try:
            r = httpx.get(f"https://api.clerk.com/v1/users/{sub}", headers={"Authorization": f"Bearer {settings.clerk_secret_key}"}, timeout=8)
            if r.status_code == 200:
                addrs = r.json().get("email_addresses") or []
                for a in addrs:
                    if a.get("email_address"):
                        return str(a["email_address"]).lower()
        except Exception:
            pass
    return f"{sub}@clerk.local"


def _is_superadmin_email(email: str) -> bool:
    allowed = {e.strip().lower() for e in settings.superadmin_emails.split(",") if e.strip()}
    return email.lower() in allowed


def get_or_create_user(db: Session, claims: dict[str, Any]) -> User:
    sub = str(claims.get("sub") or "")
    if not sub:
        raise HTTPException(status_code=401, detail="session token has no subject")
    email = _clerk_email(claims, sub)
    user = db.query(User).filter(User.clerk_id == sub).first()
    if user is None:
        # Re-link by email when the same person signs in from another instance.
        user = db.query(User).filter(User.email == email).first()
        if user is not None and user.clerk_id is None:
            user.clerk_id = sub
        else:
            org_role = str(claims.get("org_role") or claims.get("role") or "")
            role = ROLE_ADMIN if (org_role.lower() == "admin" or _is_superadmin_email(email)) else "user"
            user = User(clerk_id=sub, email=email, role=role)
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
    # Promote superadmin-listed emails even if they signed up earlier.
    if _is_superadmin_email(user.email) and user.role != ROLE_ADMIN:
        user.role = ROLE_ADMIN
    # Reflect Clerk org admin demotion/promotion when the claim is present.
    org_role = str(claims.get("org_role") or "")
    if org_role.lower() == "admin" and user.role != ROLE_ADMIN and not _is_superadmin_email(user.email):
        user.role = ROLE_ADMIN
    db.commit()
    db.refresh(user)
    return user


def _dev_user(db: Session) -> User:
    user = db.query(User).filter(User.clerk_id == "dev-admin").first()
    if user is None:
        user = db.query(User).filter(User.email == "admin@local.dev").first()
        if user is None:
            user = User(clerk_id="dev-admin", email="admin@local.dev", role=ROLE_ADMIN, plan="enterprise")
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        user.clerk_id = "dev-admin"
    if user.role != ROLE_ADMIN:
        user.role = ROLE_ADMIN
    db.commit()
    db.refresh(user)
    return user


def _bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


@dataclass
class Caller:
    user: Optional[User] = None
    api_key: Optional[ApiKey] = None
    auth_type: str = "open"  # open | master | jwt | key
    key_prefix: Optional[str] = None


def _key_caller(db: Session, raw: str) -> Optional[Caller]:
    row = db.query(ApiKey).filter(ApiKey.key_hash == hash_key(raw)).first()
    if row is None or not row.is_active:
        return None
    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None or not user.is_active:
        return None
    now = int(time.time())
    row.last_used_at = row.last_used_at  # touch handled by usage logger
    return Caller(user=user, api_key=row, auth_type="key", key_prefix=row.prefix)


def _ensure_active(user: User) -> User:
    if not user.is_active:
        raise HTTPException(status_code=403, detail="account disabled")
    return user


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Strict: used by /v1/me, /v1/keys, /v1/admin/*. Errors when anonymous."""
    token = _bearer(authorization)
    if token and settings.api_key and secrets.compare_digest(token, settings.api_key):
        raise HTTPException(status_code=401, detail="master bearer is not a user session; sign in via Clerk")
    if token and token.startswith("wf_"):
        caller = _key_caller(db, token)
        if caller and caller.user:
            return _ensure_active(caller.user)
        raise HTTPException(status_code=401, detail="invalid or revoked API key")
    if settings.test_auth and token and token.startswith("test-"):
        return _ensure_active(_test_user(db, token))
    if token and settings.clerk_enabled:
        return _ensure_active(get_or_create_user(db, verify_clerk_token(token)))
    if not settings.clerk_enabled:
        # Local dev without Clerk: single dev-admin so dashboards work.
        return _ensure_active(_dev_user(db))
    raise HTTPException(status_code=401, detail="sign-in required")


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="super-admin only")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="account disabled")
    return user


def _test_user(db: Session, token: str) -> User:
    """WAYFINDER_TEST_AUTH=1 escape hatch for CI (never in prod)."""
    if token == "test-admin":
        u = db.query(User).filter(User.email == "test-admin@local.dev").first()
        if u is None:
            u = User(clerk_id="test-admin", email="test-admin@local.dev", role=ROLE_ADMIN, plan="enterprise")
            db.add(u)
            db.commit()
            db.refresh(u)
        return u
    u = db.query(User).filter(User.email == "test-user@local.dev").first()
    if u is None:
        u = User(clerk_id="test-user", email="test-user@local.dev", role="user", plan="free")
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


def resolve_caller(request_authorization: Optional[str], db: Session, client_ip: str = "") -> Caller:
    """Lenient: used by inference endpoints. Never raises for anonymous callers
    when the gateway is open; raises 401 only when credentials are present but
    invalid, or when auth is configured and nothing was supplied."""
    token = _bearer(request_authorization)
    if token and settings.api_key and secrets.compare_digest(token, settings.api_key):
        return Caller(auth_type="master")
    if token and token.startswith("wf_"):
        caller = _key_caller(db, token)
        if caller is None:
            raise HTTPException(status_code=401, detail="invalid or revoked API key")
        return caller
    if settings.test_auth and token and token.startswith("test-"):
        return Caller(user=_test_user(db, token), auth_type="jwt")
    if token and settings.clerk_enabled:
        return Caller(user=get_or_create_user(db, verify_clerk_token(token)), auth_type="jwt")
    if token and not settings.clerk_enabled and not settings.api_key:
        # Dev convenience: treat unknown bearer as anonymous rather than 500.
        return Caller(auth_type="open")
    if token:
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")
    if settings.clerk_enabled or settings.api_key:
        # Auth is configured but nothing was supplied. Keep legacy single-key
        # behavior: 401. (Open dev instances leave both unset.)
        raise HTTPException(status_code=401, detail="missing bearer token")
    if not settings.clerk_enabled:
        return Caller(auth_type="open")
    raise HTTPException(status_code=401, detail="missing bearer token")
