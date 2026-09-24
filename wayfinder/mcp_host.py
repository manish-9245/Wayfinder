"""Hosted MCP endpoint: the stdio tool server, served remotely.

The same `mcp_server` tools are exposed over Streamable HTTP (stateless
mode — no sticky sessions, safe behind N replicas), wrapped in the
gateway's own auth: master bearer → wf_ service key → SuperTokens session,
same 401/429 shape as the inference routes. Anonymous callers are rejected
whenever inference would reject them (WAYFINDER_REQUIRE_AUTH=1,
WAYFINDER_API_KEY, or a SuperTokens core).

The tools share the gateway Router (injected at boot in app.lifespan) so a
hosted process never builds a second copy of the weights.
"""

from __future__ import annotations

import contextlib
import logging
from typing import Any, Callable, MutableMapping

log = logging.getLogger("wayfinder")

_manager: Any = None


class MCPAuthMiddleware:
    """Pure-ASGI auth gate in front of the mounted MCP handler."""

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope: MutableMapping[str, Any], receive: Callable, send: Callable) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        from fastapi import Request
        from fastapi.responses import JSONResponse

        from wayfinder import db as dbmod
        from wayfinder.auth import resolve_caller
        from wayfinder.ratelimit import enforce_rate_limit

        request = Request(scope, receive)  # type: ignore[arg-type]
        authorization = request.headers.get("authorization")
        db = dbmod.SessionLocal()
        try:
            ip = request.client.host if request.client else ""
            caller = await resolve_caller(request, authorization, db, ip)
            enforce_rate_limit(request, caller)
        except Exception as exc:
            from fastapi import HTTPException

            status = exc.status_code if isinstance(exc, HTTPException) else 500
            detail = exc.detail if isinstance(exc, HTTPException) else "internal error"
            headers = getattr(exc, "headers", None)
            resp = JSONResponse({"error": detail}, status_code=status, headers=headers)
            await resp(scope, receive, send)
            return
        finally:
            db.close()
        await self.app(scope, receive, send)


def build_mcp_app() -> Any | None:
    """Return the auth-wrapped MCP ASGI handler, or None when the
    `wayfinder[mcp]` extra is not installed (minimal installs skip the /mcp
    mount instead of crashing). Pair with `run_mcp()` in the app lifespan."""
    global _manager
    try:
        from wayfinder import mcp_server
    except ImportError as exc:
        log.warning("mcp extra missing (%s); skipping /mcp mount", exc)
        return None
    try:
        from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
    except ImportError as exc:
        log.warning("mcp streamable transport missing (%s); skipping /mcp mount", exc)
        return None
    _manager = StreamableHTTPSessionManager(app=mcp_server.server._lowlevel_server, stateless=True)

    async def _asgi(scope: MutableMapping[str, Any], receive: Callable, send: Callable) -> None:
        assert _manager is not None, "mcp manager lifespan is not running"
        await _manager.handle_request(scope, receive, send)

    return MCPAuthMiddleware(_asgi)


@contextlib.asynccontextmanager
async def run_mcp() -> Any:
    """Enter the MCP session-manager lifespan. No-op when /mcp is unmounted."""
    if _manager is None:
        yield
        return
    async with _manager.run():
        yield


def share_router(router: Any) -> None:
    """Point the MCP tools at the already-booted gateway Router so hosted
    inference never loads the weights twice in one process."""
    try:
        from wayfinder import mcp_server
    except ImportError:
        return
    mcp_server._ROUTER = router
    log.info("mcp tools share the gateway router")
