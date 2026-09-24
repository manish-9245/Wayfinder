"""Managed auth via self-hosted SuperTokens (no custom passwords anywhere).

- Browser: supertokens-auth-react on `web/`; session cookies are sent with
  `credentials: include` to the gateway's `/auth/*` APIs (same-site=None,
  secure — the two Railway domains are both HTTPS).
- Gateway: supertokens-python verifies the session against the core, then
  mirrors the user into the local DB (role/plan/quota live here, identity
  lives in SuperTokens).
- Service keys: per-user `wf_…` API keys (sha256-hashed at rest) for curl /
  server-to-server use, plus the legacy WAYFINDER_API_KEY master bearer.
- Inference endpoints accept (in order): master key → wf_ key → SuperTokens
  session cookie → test backdoor → open (only when nothing is configured).

Super-admin = DB role `admin` OR email in WAYFINDER_SUPERADMINS OR
SuperTokens UserRoles `admin` role. When SUPERTOKENS_ENABLED=0 (local dev
without a core), a `dev-admin` user is auto-provisioned so dashboards work.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from typing import Any, Optional

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from wayfinder.config import settings
from wayfinder.db import get_db
from wayfinder.models import ROLE_ADMIN, ApiKey, User

_ST_READY = False


def supertokens_ready() -> bool:
    return _ST_READY


def init_supertokens() -> bool:
    """Initialise the SDK once. Returns True when session auth is live."""
    global _ST_READY
    if _ST_READY:
        return True
    if not settings.supertokens_enabled:
        return False
    from supertokens_python import InputAppInfo, SupertokensConfig
    from supertokens_python import init as st_init
    from supertokens_python.recipe import emailpassword, session, thirdparty, userroles

    recipes: list[Any] = [
        session.init(
            cookie_same_site="none",  # web/ and gateway are different hosts
            cookie_secure=True,
            anti_csrf="VIA_CUSTOM_HEADER",  # rid header instead of csrf cookie
        ),
        emailpassword.init(),
        userroles.init(),
    ]
    providers = _oauth_providers()
    if providers:
        from supertokens_python.recipe.thirdparty.utils import SignInAndUpFeature

        recipes.append(thirdparty.init(sign_in_and_up_feature=SignInAndUpFeature(providers)))
    st_init(
        app_info=InputAppInfo(
            app_name="wayfinder",
            api_domain=settings.supertokens_api_domain,
            website_domain=settings.supertokens_website_domain,
        ),
        framework="fastapi",
        supertokens_config=SupertokensConfig(
            connection_uri=settings.supertokens_connection_uri,
            api_key=settings.supertokens_api_key or None,
        ),
        recipe_list=recipes,
        mode="asgi",
        telemetry=False,
    )
    _ST_READY = True
    return True


def _oauth_providers() -> list[Any]:
    providers: list[Any] = []
    if settings.google_client_id and settings.google_client_secret:
        from supertokens_python.recipe.thirdparty.provider import ProviderClientConfig, ProviderConfig, ProviderInput
        from supertokens_python.recipe.thirdparty.providers.google import Google

        providers.append(Google(ProviderInput(config=ProviderConfig(
            third_party_id="google",
            clients=[ProviderClientConfig(client_id=settings.google_client_id,
                                          client_secret=settings.google_client_secret)]))))
    if settings.github_client_id and settings.github_client_secret:
        from supertokens_python.recipe.thirdparty.provider import ProviderClientConfig, ProviderConfig, ProviderInput
        from supertokens_python.recipe.thirdparty.providers.github import Github

        providers.append(Github(ProviderInput(config=ProviderConfig(
            third_party_id="github",
            clients=[ProviderClientConfig(client_id=settings.github_client_id,
                                          client_secret=settings.github_client_secret)]))))
    return providers


# Import-time init so the FastAPI middleware (added below in app.py) sees
# configured recipes. No core traffic happens until a session is verified.
init_supertokens()


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def new_raw_key() -> tuple[str, str]:
    """Returns (raw_secret, prefix). Raw is shown once, never stored."""
    raw = "wf_" + secrets.token_urlsafe(32)
    return raw, raw[:11]


def _is_superadmin_email(email: str) -> bool:
    allowed = {e.strip().lower() for e in settings.superadmin_emails.split(",") if e.strip()}
    return email.lower() in allowed


async def _supertokens_identity(st_user_id: str) -> tuple[str, bool]:
    """Returns (email, is_admin) from the core. Raises 401/503 on failure."""
    try:
        from supertokens_python.asyncio import get_user
        from supertokens_python.recipe.userroles.asyncio import get_roles_for_user

        st_user = await get_user(st_user_id)
        if st_user is None:
            raise HTTPException(status_code=401, detail="unknown user")
        email = (st_user.emails[0] if st_user.emails else f"{st_user_id}@supertokens.local").lower()
        roles = await get_roles_for_user("public", st_user_id)
        return email, "admin" in (roles.roles or [])
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"identity service unavailable: {exc}") from exc


def get_or_create_user(db: Session, st_user_id: str, email: str, st_admin: bool) -> User:
    user = db.query(User).filter(User.external_id == st_user_id).first()
    if user is None:
        user = db.query(User).filter(User.email == email).first()
        if user is not None and user.external_id is None:
            user.external_id = st_user_id
        else:
            role = ROLE_ADMIN if (st_admin or _is_superadmin_email(email)) else "user"
            user = User(external_id=st_user_id, email=email, role=role)
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
    if _is_superadmin_email(user.email) and user.role != ROLE_ADMIN:
        user.role = ROLE_ADMIN
    elif st_admin and user.role != ROLE_ADMIN and not _is_superadmin_email(user.email):
        user.role = ROLE_ADMIN
    db.commit()
    db.refresh(user)
    return user


def _dev_user(db: Session) -> User:
    user = db.query(User).filter(User.external_id == "dev-admin").first()
    if user is None:
        user = db.query(User).filter(User.email == "admin@local.dev").first()
        if user is None:
            user = User(external_id="dev-admin", email="admin@local.dev", role=ROLE_ADMIN, plan="enterprise")
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        user.external_id = "dev-admin"
    if user.role != ROLE_ADMIN:
        user.role = ROLE_ADMIN
    db.commit()
    db.refresh(user)
    return user


def _test_user(db: Session, token: str) -> User:
    """WAYFINDER_TEST_AUTH=1 escape hatch for CI (never in prod)."""
    if token == "test-admin":
        u = db.query(User).filter(User.email == "test-admin@local.dev").first()
        if u is None:
            u = User(external_id="test-admin", email="test-admin@local.dev", role=ROLE_ADMIN, plan="enterprise")
            db.add(u)
            db.commit()
            db.refresh(u)
        return u
    u = db.query(User).filter(User.email == "test-user@local.dev").first()
    if u is None:
        u = User(external_id="test-user", email="test-user@local.dev", role="user", plan="free")
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


def _ensure_active(user: User) -> User:
    if not user.is_active:
        raise HTTPException(status_code=403, detail="account disabled")
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
    auth_type: str = "open"  # open | master | session | key
    key_prefix: Optional[str] = None


def _key_caller(db: Session, raw: str) -> Optional[Caller]:
    row = db.query(ApiKey).filter(ApiKey.key_hash == hash_key(raw)).first()
    if row is None or not row.is_active:
        return None
    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None or not user.is_active:
        return None
    return Caller(user=user, api_key=row, auth_type="key", key_prefix=row.prefix)


async def _session_caller(db: Session, request: Optional[Request]) -> Optional[Caller]:
    """SuperTokens session cookie → Caller. None when no session; 401 when
    the session exists but is invalid."""
    if not supertokens_ready() or request is None:
        return None
    # NB: no cookie-presence shortcut — header-transfer sessions carry tokens
    # in Authorization headers, not cookies. get_session returns None when
    # nothing session-like is present (no core traffic in that case).
    from supertokens_python.recipe.session.asyncio import get_session

    try:
        container = await get_session(request, session_required=False, anti_csrf_check=True)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"invalid session: {exc}") from exc
    if container is None:
        return None
    st_user_id = container.get_user_id()
    email, st_admin = await _supertokens_identity(st_user_id)
    return Caller(user=_ensure_active(get_or_create_user(db, st_user_id, email, st_admin)), auth_type="session")


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Strict: used by /v1/me, /v1/keys, /v1/admin/*. Errors when anonymous."""
    token = _bearer(authorization)
    if token and settings.api_key and secrets.compare_digest(token, settings.api_key):
        raise HTTPException(status_code=401, detail="master bearer is not a user session; sign in via the dashboard")
    if token and token.startswith("wf_"):
        caller = _key_caller(db, token)
        if caller and caller.user:
            return _ensure_active(caller.user)
        raise HTTPException(status_code=401, detail="invalid or revoked API key")
    if settings.test_auth and token and token.startswith("test-"):
        return _ensure_active(_test_user(db, token))
    if supertokens_ready():
        caller = await _session_caller(db, request)
        if caller and caller.user:
            return caller.user
        raise HTTPException(status_code=401, detail="sign-in required")
    # Local dev without a core: single dev-admin so dashboards work.
    return _ensure_active(_dev_user(db))


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="super-admin only")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="account disabled")
    return user


async def resolve_caller(request: Optional[Request], authorization: Optional[str],
                         db: Session, client_ip: str = "") -> Caller:
    """Lenient: used by inference endpoints. Never raises for anonymous
    callers when the gateway is open; raises 401 only when credentials are
    present but invalid, or when auth is configured and nothing was supplied.
    """
    _ = client_ip  # reserved for future IP-allowlisting
    token = _bearer(authorization)
    if token and settings.api_key and secrets.compare_digest(token, settings.api_key):
        return Caller(auth_type="master")
    if token and token.startswith("wf_"):
        caller = _key_caller(db, token)
        if caller is None:
            raise HTTPException(status_code=401, detail="invalid or revoked API key")
        return caller
    if settings.test_auth and token and token.startswith("test-"):
        return Caller(user=_test_user(db, token), auth_type="session")
    if supertokens_ready():
        caller = await _session_caller(db, request)
        if caller is not None:
            return caller
    if token:
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")
    if supertokens_ready() or settings.api_key:
        # Auth is configured but nothing was supplied. Keep the legacy
        # single-key behavior: 401. (Open dev instances leave both unset.)
        raise HTTPException(status_code=401, detail="missing bearer token")
    return Caller(auth_type="open")
