"""Policy loading and validation.

Policies are static YAML (see policies.yaml). They are loaded once at startup,
validated against laya's question contract, and served read-only. Per-request
overrides (thresholds, model pin) ride in the request body, never by mutating
global state — that is what keeps workers stateless and horizontally scalable.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import yaml

REQUIRED_QUESTION_KEYS = {"type", "instructions"}
KNOWN_TYPES = {"choice", "score", "noul"}


def load_policies(path: str | Path) -> Dict[str, Dict[str, Any]]:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"policies file not found: {p}")
    data = yaml.safe_load(p.read_text()) or {}
    policies = data.get("policies", {})
    if not policies:
        raise ValueError(f"no policies defined in {p}")
    for name, pol in policies.items():
        _validate_policy(name, pol)
    return policies


def _validate_policy(name: str, pol: Dict[str, Any]) -> None:
    questions = pol.get("questions")
    if not questions or not isinstance(questions, dict):
        raise ValueError(f"policy {name!r}: needs a non-empty questions mapping")
    for qname, q in questions.items():
        if not isinstance(q, dict):
            raise ValueError(f"policy {name!r} question {qname!r}: must be a mapping")
        missing = REQUIRED_QUESTION_KEYS - set(q.keys())
        if missing:
            raise ValueError(f"policy {name!r} question {qname!r}: missing {sorted(missing)}")
        if q["type"] not in KNOWN_TYPES:
            raise ValueError(
                f"policy {name!r} question {qname!r}: unknown type {q['type']!r}, expected {sorted(KNOWN_TYPES)}"
            )
        if q["type"] in ("choice", "score") and not q.get("criteria"):
            raise ValueError(f"policy {name!r} question {qname!r}: {q['type']} needs non-empty criteria")


def verdict_for(policy: Dict[str, Any], answers: Dict[str, Any]) -> Dict[str, Any]:
    """Collapse per-question answers into one act/escalate/block verdict.

    Pure function of (policy thresholds, answers) — no I/O, trivially testable,
    identical on every replica.
    """
    auto = float(policy.get("auto_act_above", 0.85))
    low = float(policy.get("escalate_below", 0.60))
    worst = 0.0
    worst_q: str | None = None
    for qname, ans in answers.items():
        sig = _signal(ans)
        if sig > worst:
            worst, worst_q = sig, qname
    # llm_firewall / content_safety semantics: high risk signal -> block.
    is_safety = any(k in policy.get("description", "").lower() for k in ("block", "jailbreak", "toxic", "leak"))
    if is_safety or "firewall" in str(policy.get("description", "")).lower() or worst_q in (
        "jailbreak",
        "injection",
        "toxic",
        "threat",
    ):
        if worst >= auto:
            return {"verdict": "block", "confidence": round(worst, 4), "trigger": worst_q}
        if worst >= low:
            return {"verdict": "review", "confidence": round(worst, 4), "trigger": worst_q}
        return {"verdict": "allow", "confidence": round(1 - worst, 4), "trigger": worst_q}
    # default: high confidence -> act, low -> escalate, middle -> review.
    top_conf = _top_confidence(answers)
    if top_conf >= auto:
        return {"verdict": "act", "confidence": round(top_conf, 4), "trigger": worst_q}
    if top_conf < low:
        return {"verdict": "escalate", "confidence": round(top_conf, 4), "trigger": worst_q}
    return {"verdict": "review", "confidence": round(top_conf, 4), "trigger": worst_q}


def _signal(ans: Dict[str, Any]) -> float:
    """Risk/confidence signal in [0,1] regardless of primitive."""
    if not isinstance(ans, dict):
        return 0.0
    if isinstance(ans.get("noul"), (int, float)):
        return float(ans["noul"])
    if isinstance(ans.get("confidence"), (int, float)):
        return float(ans["confidence"])
    probs = ans.get("probabilities") or {}
    if isinstance(probs, dict) and probs:
        try:
            return float(max(probs.values()))
        except (TypeError, ValueError):
            return 0.0
    return 0.0


def _top_confidence(answers: Dict[str, Any]) -> float:
    best = 0.0
    for ans in answers.values():
        if isinstance(ans, dict) and isinstance(ans.get("confidence"), (int, float)):
            best = max(best, float(ans["confidence"]))
    if best:
        return best
    return max([_signal(a) for a in answers.values()] or [0.0])
