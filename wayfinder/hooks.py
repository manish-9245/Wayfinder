"""Cross-cutting hooks: cache, audit, metrics, redaction.

Design: every hook is a tiny pure-ish unit with no framework import, so it can
be unit-tested without booting torch. The FastAPI layer wires them together.

Cache key = sha256(canonical_json(state) + canonical_json(questions) + model).
Both the in-memory LRU and Redis (if WAYFINDER_REDIS_URL is set) store the full
laya result dict with a 1h TTL. Hits skip torch entirely via early return —
the single biggest throughput win for repeated traffic (spam waves, retries,
pollers).
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import time
from collections import OrderedDict
from contextvars import ContextVar
from typing import Any, Dict, Optional

# Correlation ID for the in-flight request, set per-request by the
# request-id middleware in app.py. Safe default when no request is active
# (startup, tests, background work).
req_id_ctx: ContextVar[str] = ContextVar("wayfinder_request_id", default="-")


def new_request_id() -> str:
    return secrets.token_hex(8)


_METRICS: Dict[str, Any] = {"requests": 0, "cache_hits": 0, "blocks": 0, "latency_ms_sum": 0.0,
                            "errors": 0, "rejected_401": 0, "rejected_429": 0, "redis_errors": 0,
                            "by_policy": {}}


def metrics_snapshot() -> Dict[str, Any]:
    reqs = _METRICS["requests"]
    avg = _METRICS["latency_ms_sum"] / reqs if reqs else 0.0
    return {
        "requests": reqs,
        "cache_hits": _METRICS["cache_hits"],
        "cache_hit_rate": round(_METRICS["cache_hits"] / reqs, 4) if reqs else 0.0,
        "blocks": _METRICS["blocks"],
        "errors": _METRICS["errors"],
        "rejected_401": _METRICS["rejected_401"],
        "rejected_429": _METRICS["rejected_429"],
        "redis_errors": _METRICS["redis_errors"],
        "by_policy": dict(_METRICS["by_policy"]),
        "avg_latency_ms": round(avg, 2),
    }


def reset_metrics() -> None:
    _METRICS.update(requests=0, cache_hits=0, blocks=0, latency_ms_sum=0.0, errors=0,
                    rejected_401=0, rejected_429=0, redis_errors=0)
    _METRICS["by_policy"] = {}


def record_redis_error() -> None:
    """Count a failed Redis operation. Every Redis call site fails open to
    local state, so this counter (surfaced in /metrics) is the ops signal
    that the shared cache/limits are degraded — not the logs."""
    _METRICS["redis_errors"] += 1


def record_request(latency_ms: float, *, cache_hit: bool = False, blocked: bool = False,
                   error: bool = False, status_code: int | None = None, policy: str = "") -> None:
    _METRICS["requests"] += 1
    _METRICS["latency_ms_sum"] += latency_ms
    if cache_hit:
        _METRICS["cache_hits"] += 1
    if blocked:
        _METRICS["blocks"] += 1
    if error:
        _METRICS["errors"] += 1
    if status_code == 401:
        _METRICS["rejected_401"] += 1
    elif status_code == 429:
        _METRICS["rejected_429"] += 1
    if policy:
        _METRICS["by_policy"][policy] = _METRICS["by_policy"].get(policy, 0) + 1


def cache_key(state: Any, questions: Dict[str, Any], model: Optional[str] = None) -> str:
    blob = json.dumps({"s": state, "q": questions, "m": model}, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(blob.encode()).hexdigest()


class LRUCache:
    """Thread-safe-enough in-memory LRU (CPython GIL makes get/set atomic)."""

    def __init__(self, capacity: int = 2048) -> None:
        self.capacity = capacity
        self._data: OrderedDict[str, Any] = OrderedDict()

    def get(self, key: str) -> Any | None:
        if self.capacity <= 0:
            return None
        try:
            val = self._data.pop(key)
        except KeyError:
            return None
        self._data[key] = val  # re-insert as most-recent
        return val

    def set(self, key: str, value: Any) -> None:
        if self.capacity <= 0:
            return
        self._data.pop(key, None)
        self._data[key] = value
        while len(self._data) > self.capacity:
            self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)


# Cheap, dependency-free PII scrub for audit logs (NOT a substitute for a real
# DLP pass on regulated data — it only keeps tokens out of YOUR logs).
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_CARD_RE = re.compile(r"\b(?:\d[ -]?){12,15}\d\b")
_PHONE_RE = re.compile(r"\b\+?\d[\d\s().-]{7,}\b")


def redact_for_log(text: str) -> str:
    text = _EMAIL_RE.sub("[email]", text)
    text = _CARD_RE.sub("[card]", text)
    # phone pattern is greedy; only apply when it looks like a phone, not a year/id.
    if sum(c.isdigit() for c in text) <= 40:
        text = _PHONE_RE.sub("[phone]", text)
    return text


def audit_line(policy: str, state: Any, verdict: Dict[str, Any], latency_ms: float) -> str:
    preview = json.dumps(state, default=str, ensure_ascii=False)[:300]
    return (
        f"rid={req_id_ctx.get()} policy={policy} verdict={verdict.get('verdict')} "
        f"conf={verdict.get('confidence')} trigger={verdict.get('trigger')} "
        f"{latency_ms:.1f}ms state={redact_for_log(preview)}"
    )


def security_event(action: str, detail: str = "") -> str:
    """One-line security audit record (key lifecycle, admin changes, auth failures)."""
    base = f"rid={req_id_ctx.get()} security action={action}"
    return f"{base} {detail}" if detail else base


class Timer:
    def __enter__(self) -> "Timer":
        self.start = time.perf_counter()
        return self

    def __exit__(self, *exc: Any) -> None:
        self.ms = (time.perf_counter() - self.start) * 1000.0
