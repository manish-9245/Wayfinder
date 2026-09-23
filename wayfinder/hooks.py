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
import time
from collections import OrderedDict
from typing import Any, Dict, Optional

_METRICS: Dict[str, Any] = {"requests": 0, "cache_hits": 0, "blocks": 0, "latency_ms_sum": 0.0, "errors": 0}


def metrics_snapshot() -> Dict[str, Any]:
    reqs = _METRICS["requests"]
    avg = _METRICS["latency_ms_sum"] / reqs if reqs else 0.0
    return {
        "requests": reqs,
        "cache_hits": _METRICS["cache_hits"],
        "cache_hit_rate": round(_METRICS["cache_hits"] / reqs, 4) if reqs else 0.0,
        "blocks": _METRICS["blocks"],
        "errors": _METRICS["errors"],
        "avg_latency_ms": round(avg, 2),
    }


def record_request(latency_ms: float, *, cache_hit: bool = False, blocked: bool = False, error: bool = False) -> None:
    _METRICS["requests"] += 1
    _METRICS["latency_ms_sum"] += latency_ms
    if cache_hit:
        _METRICS["cache_hits"] += 1
    if blocked:
        _METRICS["blocks"] += 1
    if error:
        _METRICS["errors"] += 1


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
_CARD_RE = re.compile(r"\b(?:\d[ -]?){13,16}\b")
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
        f"policy={policy} verdict={verdict.get('verdict')} "
        f"conf={verdict.get('confidence')} trigger={verdict.get('trigger')} "
        f"{latency_ms:.1f}ms state={redact_for_log(preview)}"
    )


class Timer:
    def __enter__(self) -> "Timer":
        self.start = time.perf_counter()
        return self

    def __exit__(self, *exc: Any) -> None:
        self.ms = (time.perf_counter() - self.start) * 1000.0
