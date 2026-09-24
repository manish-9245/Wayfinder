"""wayfinder HTTP gateway.

One stateless process image, safe to replicate behind any load balancer:

  POST /v1/decide/{policy}   named policy (questions + thresholds from YAML)
  POST /v1/systemone         Jev-compatible passthrough (repoint baseUrl, keep client)
  POST /predict              raw state+questions (auto-route by language)
  POST /predict/batch        many states, one questions schema (shared forward passes)
  GET  /policies             list policies + thresholds (no weights)
  GET  /health               readiness (ready only after Router preload)
  GET  /metrics              counters + hit rate + avg latency (Prometheus-friendly JSON)
  GET  /                    static builder UI

Performance contract:
- Router is built ONCE in lifespan; never per request. Preload removes the
  multi-second checkpoint build from the hot path.
- Inference intentionally runs OUTSIDE any global lock (Router's own
  load/evict path is thread-safe upstream); a lock here would serialise
  concurrent predictions and halve throughput.
- Cache lookup happens BEFORE torch. A hit returns in microseconds.
- Hard rails: body cap (413), question count cap (422/413), state char cap
  (422) — an unbounded body can OOM the worker and starve /health.
"""

from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from wayfinder.auth import Caller, resolve_caller, supertokens_ready
from wayfinder.config import settings
from wayfinder.hooks import LRUCache, Timer, audit_line, cache_key, metrics_snapshot, record_request
from wayfinder.policies import load_policies, verdict_for
from wayfinder.routes_platform import admin_router, keys_router, me_router

log = logging.getLogger("wayfinder")

ROUTER: Any = None
POLICIES: Dict[str, Dict[str, Any]] = {}
CACHE = LRUCache(capacity=settings.cache_size)
REDIS: Any = None  # optional shared cache across replicas

STATE = Union[str, Dict[str, Any], List[Any]]


# --------------------------------------------------------------------------- #
# models
# --------------------------------------------------------------------------- #

class DecideRequest(BaseModel):
    state: STATE = Field(..., description="Text/record to judge: string, dict, or list")
    model: Optional[str] = Field(default=None, description="Pin a checkpoint: english|multilingual|typed-decisions")
    task: Optional[str] = None
    lang: Optional[str] = Field(default=None, description="ISO code hint; skips detection")
    options: Dict[str, Any] = Field(default_factory=dict, description="Per-call overrides: auto_act_above, escalate_below")


class RawPredictRequest(DecideRequest):
    questions: Dict[str, Any] = Field(..., min_length=1)


class BatchRequest(BaseModel):
    states: List[STATE] = Field(..., min_length=1, max_length=128)
    questions: Optional[Dict[str, Any]] = Field(default=None, description="Raw questions (omit when policy is set)")
    policy: Optional[str] = None
    model: Optional[str] = None
    task: Optional[str] = None
    lang: Optional[str] = None


# --------------------------------------------------------------------------- #
# guards
# --------------------------------------------------------------------------- #

def require_auth(authorization: Optional[str] = Header(default=None)) -> None:
    """Timing-safe bearer check. No key configured = open (dev); key set = enforced."""
    if not settings.api_key:
        return
    want = f"Bearer {settings.api_key}"
    if not authorization or not hmac.compare_digest(authorization, want):
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")


async def enforce_body_cap(request: Request) -> None:
    if request.headers.get("content-length"):
        try:
            if int(request.headers["content-length"]) > settings.max_body_bytes:
                raise HTTPException(status_code=413, detail=f"body exceeds {settings.max_body_bytes} bytes")
        except ValueError:
            pass


def check_state(state: Any, questions: Dict[str, Any]) -> None:
    if not state:
        raise HTTPException(status_code=422, detail="state must not be empty")
    if len(questions) > settings.max_questions:
        raise HTTPException(status_code=413, detail=f"too many questions (max {settings.max_questions})")
    try:
        if len(str(state)) > settings.max_state_chars:
            raise HTTPException(status_code=422, detail=f"state exceeds {settings.max_state_chars} chars")
    except HTTPException:
        raise
    except Exception:
        pass


def _policy_or_422(name: str) -> Dict[str, Any]:
    try:
        return POLICIES[name]
    except KeyError:
        raise HTTPException(status_code=422, detail=f"unknown policy {name!r}; see GET /policies")


def _resolve_questions(policy: Dict[str, Any], body_questions: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if body_questions:
        return body_questions
    return policy["questions"]


# --------------------------------------------------------------------------- #
# lifespan: build the Router exactly once
# --------------------------------------------------------------------------- #

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ROUTER, POLICIES, REDIS
    import torch

    from wayfinder.db import init_db

    for attempt in range(5):  # Postgres may still be waking up on first deploy
        try:
            init_db()  # platform tables (users, keys, usage). No-op after first boot.
            break
        except Exception as exc:
            if attempt == 4:
                # Inference still serves (usage logging is best-effort);
                # platform routes 500 until the DB is reachable.
                log.warning("init_db failed after retries (%s); continuing degraded", exc)
            else:
                import time as _time

                _time.sleep(2)

    if settings.threads:
        torch.set_num_threads(settings.threads)
        torch.set_num_interop_threads(settings.threads)

    POLICIES = load_policies(settings.policies_file)
    log.info("loaded %d policies from %s", len(POLICIES), settings.policies_file)

    if settings.redis_url:
        try:
            import redis.asyncio as aioredis  # type: ignore

            REDIS = aioredis.from_url(settings.redis_url, decode_responses=True)
            await REDIS.ping()
            log.info("redis cache enabled")
        except Exception as exc:  # redis is best-effort; local LRU still works
            log.warning("redis unavailable (%s); using local LRU only", exc)
            REDIS = None

    from laya import Router

    models = [m.strip() for m in settings.models.split(",") if m.strip()]
    ROUTER = Router(
        preload=settings.preload,
        device=settings.device,
        max_loaded=settings.max_loaded,
    )
    if settings.preload and models:
        try:
            ROUTER.preload(models)  # type: ignore[attr-defined]
        except TypeError:
            pass  # older laya: preload happens in constructor
    log.info("router ready (preload=%s models=%s)", settings.preload, models)
    yield
    ROUTER = None


app = FastAPI(title="wayfinder", version="0.1.0", lifespan=lifespan,
              description="Universal doubt layer: one policy call, calibrated act/escalate/block verdict.")
app.add_middleware(GZipMiddleware, minimum_size=1024)
if settings.supertokens_enabled:
    # Cross-domain dashboard (web/ ≠ gateway host): explicit origin +
    # credentials, otherwise browsers drop the session cookies.
    from supertokens_python.framework.fastapi import get_middleware

    app.add_middleware(get_middleware())
    app.add_middleware(CORSMiddleware, allow_origins=[settings.supertokens_website_domain],
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
else:
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(keys_router)
app.include_router(me_router)
app.include_router(admin_router)

_UI_DIR = Path(__file__).parent.parent / "ui"
if _UI_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_UI_DIR)), name="static")


def _router() -> Any:
    if ROUTER is None:
        raise HTTPException(status_code=503, detail="router not ready")
    return ROUTER


# --------------------------------------------------------------------------- #
# platform: caller snapshot + persistent usage log
# --------------------------------------------------------------------------- #

class _Ctx:
    """Detached identity snapshot (safe to hold after the DB session closes)."""
    __slots__ = ("user_id", "key_prefix", "auth_type")
    user_id: Optional[int]
    key_prefix: Optional[str]
    auth_type: str


async def _platform_ctx(request: Request, authorization: Optional[str]) -> _Ctx:
    """Resolve caller (master bearer / wf_ key / SuperTokens session / open dev), then
    enforce per-IP + per-identity rate limits and monthly quota. Raises
    401/403/429 exactly where the legacy bearer guard used to raise."""
    from wayfinder import db as dbmod
    from wayfinder.ratelimit import enforce_quota, enforce_rate_limit

    db = dbmod.SessionLocal()
    try:
        ip = request.client.host if request.client else ""
        caller: Caller = await resolve_caller(request, authorization, db, ip)
        enforce_rate_limit(request, caller)
        if caller.user is not None:
            if not caller.user.is_active:
                raise HTTPException(status_code=403, detail="account disabled")
            try:
                enforce_quota(db, caller.user)
            except HTTPException:
                raise
            except Exception as exc:  # quota is best-effort; never fail inference on DB trouble
                log.warning("quota check failed (%s)", exc)
        ctx = _Ctx()
        ctx.user_id = caller.user.id if caller.user is not None else None
        ctx.key_prefix = caller.key_prefix
        ctx.auth_type = caller.auth_type
        return ctx
    finally:
        db.close()


def _record(ctx: Optional[_Ctx], request: Request, *, policy: str, verdict: str = "",
            confidence: Optional[float] = None, latency_ms: float = 0.0,
            cache_hit: bool = False, blocked: bool = False, error: bool = False,
            status_code: int = 200, state: Any = "") -> None:
    """Best-effort persistent log. Never breaks inference if the DB is down."""
    try:
        from wayfinder import db as dbmod
        from wayfinder import usage as usage_store

        db = dbmod.SessionLocal()
        try:
            usage_store.log_usage(
                db, user_id=ctx.user_id if ctx else None, key_prefix=ctx.key_prefix if ctx else None,
                policy=policy, verdict=verdict, confidence=confidence, latency_ms=latency_ms,
                cache_hit=cache_hit, blocked=blocked, error=error, status_code=status_code,
                ip=request.client.host if request.client else "", state=state)
        finally:
            db.close()
    except Exception as exc:  # logging must never fail the request
        log.warning("usage log failed (%s)", exc)


async def _log_rejection(request: Request, authorization: Optional[str], policy: str, status_code: int, state: Any = "") -> None:
    """Best-effort row for 401/429 rejections (identity resolved, limits skipped)."""
    try:
        from wayfinder import db as dbmod

        db = dbmod.SessionLocal()
        try:
            caller = await resolve_caller(request, authorization, db,
                                          request.client.host if request.client else "")
            ctx = _Ctx()
            ctx.user_id = caller.user.id if caller.user is not None else None
            ctx.key_prefix = caller.key_prefix
            ctx.auth_type = caller.auth_type
        except Exception:
            ctx = None
        finally:
            db.close()
        _record(ctx, request, policy=policy, error=True, status_code=status_code, state=state)
    except Exception:
        pass


async def _cached_predict(state: Any, questions: Dict[str, Any], *, model=None, task=None, lang=None) -> tuple[Dict[str, Any], bool]:
    key = cache_key(state, questions, model)
    hit = CACHE.get(key)
    if hit is not None:
        return dict(hit), True
    if REDIS is not None:
        try:
            import json as _json

            raw = await REDIS.get(f"wf:{key}")
            if raw:
                res = _json.loads(raw)
                CACHE.set(key, res)
                return res, True
        except Exception:
            pass
    res = _router().predict(state, questions, model=model, task=task, lang=lang)
    CACHE.set(key, res)
    if REDIS is not None:
        try:
            import json as _json

            await REDIS.setex(f"wf:{key}", 3600, _json.dumps(res, default=str))
        except Exception:
            pass
    return res, False


def _with_verdict(policy_name: str, policy: Dict[str, Any], res: Dict[str, Any], latency_ms: float) -> Dict[str, Any]:
    eff = dict(policy)
    verdict = verdict_for(eff, res.get("answers", {}))
    log.info(audit_line(policy_name, res.get("state", "?"), verdict, latency_ms))
    return {**res, "policy": policy_name, "verdict": verdict,
            "thresholds": {"auto_act_above": eff.get("auto_act_above"), "escalate_below": eff.get("escalate_below")}}


# --------------------------------------------------------------------------- #
# routes
# --------------------------------------------------------------------------- #

@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ready" if ROUTER is not None else "loading",
            "policies": sorted(POLICIES), "cache_entries": len(CACHE)}


@app.get("/metrics")
def metrics() -> Dict[str, Any]:
    return metrics_snapshot()


@app.get("/policies")
def list_policies(full: bool = False) -> Dict[str, Any]:
    out = {}
    for name, p in POLICIES.items():
        entry: Dict[str, Any] = {"description": p.get("description"),
                                 "auto_act_above": p.get("auto_act_above"),
                                 "escalate_below": p.get("escalate_below")}
        entry["questions"] = p.get("questions", {}) if full else list(p.get("questions", {}))
        out[name] = entry
    return out


_DOCS_DIR = Path(__file__).parent.parent / "docs"
_DOCS_ALLOW = {"API.md", "POLICIES.md", "MCP.md", "ARCHITECTURE.md", "DEPLOY.md", "architecture.svg"}


@app.get("/docs-files/{name}")
def docs_file(name: str):
    """Raw markdown for the SPA docs tab. Allow-listed to docs/ only."""
    if name not in _DOCS_ALLOW:
        raise HTTPException(status_code=404, detail="unknown doc")
    path = _DOCS_DIR / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="doc not shipped in this image")
    media = "image/svg+xml" if name.endswith(".svg") else "text/markdown"
    return FileResponse(str(path), media_type=media)


@app.post("/v1/decide/{policy}")
async def decide(policy: str, req: DecideRequest, request: Request,
                 authorization: Optional[str] = Header(default=None),
                 __: None = Depends(enforce_body_cap)) -> Dict[str, Any]:
    try:
        ctx = await _platform_ctx(request, authorization)
    except HTTPException as exc:
        await _log_rejection(request, authorization, policy, exc.status_code, req.state)
        record_request(0, error=True)
        raise
    pol = _policy_or_422(policy)
    eff = dict(pol)
    for k in ("auto_act_above", "escalate_below"):
        if k in (req.options or {}):
            eff[k] = req.options[k]
    questions = eff["questions"]
    try:
        check_state(req.state, questions)
    except HTTPException as exc:
        _record(ctx, request, policy=policy, error=True, status_code=exc.status_code, state=req.state)
        record_request(0, error=True)
        raise
    with Timer() as t:
        try:
            res, hit = await _cached_predict(req.state, questions, model=req.model, task=req.task, lang=req.lang)
        except (KeyError, ValueError) as exc:
            _record(ctx, request, policy=policy, error=True, status_code=422, state=req.state)
            record_request(0, error=True)
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            _record(ctx, request, policy=policy, error=True, status_code=500, state=req.state)
            record_request(0, error=True)
            raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
    out = _with_verdict(policy, eff, res, t.ms)
    out["cache_hit"] = hit
    record_request(t.ms, cache_hit=hit, blocked=out["verdict"]["verdict"] == "block")
    _record(ctx, request, policy=policy, verdict=out["verdict"]["verdict"],
            confidence=out["verdict"].get("confidence"), latency_ms=t.ms,
            cache_hit=hit, blocked=out["verdict"]["verdict"] == "block", state=req.state)
    return out


@app.post("/v1/systemone")
async def systemone(payload: Dict[str, Any], request: Request,
                    authorization: Optional[str] = Header(default=None),
                    __: None = Depends(enforce_body_cap)) -> Dict[str, Any]:
    """Jev-compatible entry: {"state", "questions", "model"?} -> laya result.

    Existing Jev clients repoint baseUrl here; nothing else changes.
    """
    state, questions = payload.get("state"), payload.get("questions")
    try:
        ctx = await _platform_ctx(request, authorization)
    except HTTPException as exc:
        await _log_rejection(request, authorization, "", exc.status_code, state or "")
        record_request(0, error=True)
        raise
    if not state or not questions:
        _record(ctx, request, policy="", error=True, status_code=422, state=state or "")
        raise HTTPException(status_code=422, detail="needs {state, questions}")
    try:
        check_state(state, questions)
    except HTTPException as exc:
        _record(ctx, request, policy="", error=True, status_code=exc.status_code, state=state)
        raise
    with Timer() as t:
        try:
            res, hit = await _cached_predict(state, questions, model=payload.get("model"),
                                             task=payload.get("task"), lang=payload.get("lang"))
        except (KeyError, ValueError) as exc:
            _record(ctx, request, policy="", error=True, status_code=422, state=state)
            record_request(0, error=True)
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            _record(ctx, request, policy="", error=True, status_code=500, state=state)
            record_request(0, error=True)
            raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
    res["cache_hit"] = hit
    record_request(t.ms, cache_hit=hit)
    _record(ctx, request, policy="", latency_ms=t.ms, cache_hit=hit, state=state)
    return res


@app.post("/predict")
async def predict(req: RawPredictRequest, request: Request,
                  authorization: Optional[str] = Header(default=None),
                  __: None = Depends(enforce_body_cap)) -> Dict[str, Any]:
    try:
        ctx = await _platform_ctx(request, authorization)
    except HTTPException as exc:
        await _log_rejection(request, authorization, "", exc.status_code, req.state)
        record_request(0, error=True)
        raise
    try:
        check_state(req.state, req.questions)
    except HTTPException as exc:
        _record(ctx, request, policy="", error=True, status_code=exc.status_code, state=req.state)
        raise
    with Timer() as t:
        try:
            res, hit = await _cached_predict(req.state, req.questions, model=req.model, task=req.task, lang=req.lang)
        except (KeyError, ValueError) as exc:
            _record(ctx, request, policy="", error=True, status_code=422, state=req.state)
            record_request(0, error=True)
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            _record(ctx, request, policy="", error=True, status_code=500, state=req.state)
            record_request(0, error=True)
            raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
    res["cache_hit"] = hit
    record_request(t.ms, cache_hit=hit)
    _record(ctx, request, policy="", latency_ms=t.ms, cache_hit=hit, state=req.state)
    return res


@app.post("/predict/batch")
async def predict_batch(req: BatchRequest, request: Request,
                        authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    questions = req.questions
    policy_name = req.policy or ""
    try:
        ctx = await _platform_ctx(request, authorization)
    except HTTPException as exc:
        await _log_rejection(request, authorization, policy_name, exc.status_code)
        record_request(0, error=True)
        raise
    if req.policy:
        try:
            questions = _policy_or_422(req.policy)["questions"]
        except HTTPException as exc:
            _record(ctx, request, policy=policy_name, error=True, status_code=exc.status_code)
            raise
    if not questions:
        _record(ctx, request, policy=policy_name, error=True, status_code=422)
        raise HTTPException(status_code=422, detail="supply questions or a policy")
    if len(req.states) > 128:
        _record(ctx, request, policy=policy_name, error=True, status_code=413)
        raise HTTPException(status_code=413, detail="max 128 states per batch call")
    # Fast path: one shared Router.predict_batch when nothing is cached.
    # Cache-aware path would break batching; for mixed hit/miss workloads the
    # caller should split. Here we keep it simple and batch the misses.
    to_run: List[int] = []
    results: List[Any] = [None] * len(req.states)
    for i, s in enumerate(req.states):
        hit = CACHE.get(cache_key(s, questions, req.model))
        if hit is not None:
            results[i] = {**dict(hit), "cache_hit": True}
        else:
            to_run.append(i)
    with Timer() as t:
        if to_run:
            try:
                ran = _router().predict_batch(
                    [{"state": req.states[i], "questions": questions} for i in to_run]
                )
            except TypeError:
                # older laya without Router.predict_batch: fall back to loop
                ran = [_router().predict(req.states[i], questions, model=req.model, task=req.task, lang=req.lang)
                       for i in to_run]
            for idx, res in zip(to_run, ran):
                CACHE.set(cache_key(req.states[idx], questions, req.model), res)
                results[idx] = {**res, "cache_hit": False}
    record_request(t.ms)
    _record(ctx, request, policy=policy_name, latency_ms=t.ms,
            state=f"batch count={len(results)}")
    return {"count": len(results), "results": results}


@app.get("/")
def index() -> FileResponse:
    idx = _UI_DIR / "index.html"
    if idx.exists():
        return FileResponse(str(idx), media_type="text/html")
    return JSONResponse({"service": "wayfinder", "docs": "/docs", "policies": "/policies", "health": "/health"})


def main() -> None:
    import uvicorn

    uvicorn.run("wayfinder.app:app", host=settings.host, port=settings.port, log_level=settings.log_level)


if __name__ == "__main__":
    main()
