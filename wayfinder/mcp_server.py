"""wayfinder MCP stdio server: typed decisions as tools for any MCP client.

Claude Desktop / Cursor / OpenClaw config (stdio transport):

    {
      "mcpServers": {
        "wayfinder": {
          "command": "wayfinder-mcp",
          "env": { "WAYFINDER_POLICIES": "/path/to/policies.yaml", "LAYA_DEVICE": "cpu" }
        }
      }
    }

Tools:
  wayfinder_decide    run a named policy (questions + thresholds) over any state
  wayfinder_predict   raw state + hand-written questions (auto-routed)
  wayfinder_route     routing decision only — no forward pass, no download
  wayfinder_policies  list policies, questions and thresholds
  wayfinder_status    health + metrics (no weights required)

Env (same meaning as gate.config where it exists):
  WAYFINDER_POLICIES  policies file (default: wayfinder/policies.yaml next to this package)
  WAYFINDER_PRELOAD   "1" to build checkpoints at startup (default: lazy "0" — keeps
                 the MCP handshake instant; first decide pays the load)
  LAYA_MODELS    comma list to preload (default: english)
  LAYA_DEVICE    torch device | LAYA_THREADS: cap torch threads (<= phys cores)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

try:
    from mcp.server.mcpserver import MCPServer
    from mcp.server.mcpserver.exceptions import ToolError as McpToolError
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "the wayfinder[mcp] extra is required: pip install 'wayfinder[mcp]'"
    ) from exc

from wayfinder.policies import load_policies, verdict_for

server = MCPServer("wayfinder", version="0.1.0")

_ROUTER: Any = None
_POLICIES: Dict[str, Dict[str, Any]] | None = None

_GUARDRAILS = (
    "Use for structured decisions only: choice (finite labels), score (ordinal "
    "rubric), noul (calibrated P(true)). One forward pass ~33ms GPU / ~200ms CPU. "
    "No text generation, no hallucination. NOT for open Q&A, summarisation, "
    "rewriting, code, or multi-hop reasoning."
)


def _policies_file() -> str:
    return os.getenv("WAYFINDER_POLICIES", str(Path(__file__).parent / "policies.yaml"))


def policies() -> Dict[str, Dict[str, Any]]:
    global _POLICIES
    if _POLICIES is None:
        _POLICIES = load_policies(_policies_file())
    return _POLICIES


def _env_bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


def _ensure_router() -> Any:
    global _ROUTER
    if _ROUTER is not None:
        return _ROUTER
    import torch
    from laya import Router

    threads = os.environ.get("LAYA_THREADS")
    if threads:
        torch.set_num_threads(int(threads))
    _ROUTER = Router(preload=False, device=os.getenv("LAYA_DEVICE") or None,
                     max_loaded=int(os.getenv("LAYA_MAX_LOADED", "2")))
    return _ROUTER


def _dump(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _tool_error(code: str, message: str) -> McpToolError:
    # mcp 2.x redacts generic Exceptions; only ToolError keeps our JSON on the wire.
    return McpToolError(_dump({"error": code, "message": message}))


@server.tool(name="wayfinder_policies")
def wayfinder_policies_tool() -> str:
    """List every decision policy: description, questions, thresholds."""
    try:
        pols = policies()
        return _dump({n: {"description": p.get("description"),
                          "questions": p.get("questions"),
                          "auto_act_above": p.get("auto_act_above"),
                          "escalate_below": p.get("escalate_below")} for n, p in pols.items()})
    except Exception as exc:
        raise _tool_error("internal_error", f"{type(exc).__name__}: {exc}") from exc


@server.tool(
    name="wayfinder_decide",
    description=("Run a named gate policy over any state; returns answers plus an "
                 "act/review/escalate (or allow/review/block) verdict. " + _GUARDRAILS),
)
def wayfinder_decide_tool(policy: str, state: dict, model: Optional[str] = None) -> str:
    """Run a named policy (llm_firewall | support_inbound | model_router | content_safety)."""
    try:
        pols = policies()
        if policy not in pols:
            raise _tool_error("unknown_policy", f"unknown policy {policy!r}; known: {sorted(pols)}")
        pol = pols[policy]
        res = _ensure_router().predict(state, pol["questions"], model=model)
        return _dump({**res, "policy": policy, "verdict": verdict_for(pol, res.get("answers", {}))})
    except McpToolError:
        raise
    except Exception as exc:
        raise _tool_error("internal_error", f"{type(exc).__name__}: {exc}") from exc


@server.tool(
    name="wayfinder_predict",
    description=("Answer hand-written typed questions over any state in one forward "
                 "pass. questions: {name: {type, instructions, criteria?}}. " + _GUARDRAILS),
)
def wayfinder_predict_tool(state: dict, questions: dict, model: Optional[str] = None) -> str:
    """Answer raw typed questions (choice/score/noul) over any state."""
    try:
        res = _ensure_router().predict(state, questions, model=model)
        return _dump(res)
    except Exception as exc:
        raise _tool_error("internal_error", f"{type(exc).__name__}: {exc}") from exc


@server.tool(
    name="wayfinder_route",
    description=("Routing decision only: which checkpoint would answer, and why. "
                 "No forward pass, no download. " + _GUARDRAILS),
)
def wayfinder_route_tool(state: dict, questions: dict) -> str:
    """Decide which checkpoint would answer, without running the model."""
    try:
        d = _ensure_router().route(state, questions)
        return _dump({"model": d.model, "reason": d.reason})
    except Exception as exc:
        raise _tool_error("internal_error", f"{type(exc).__name__}: {exc}") from exc


@server.tool(name="wayfinder_status")
def wayfinder_status_tool() -> str:
    """Health + config. Never loads weights."""
    try:
        return _dump({"status": "ok", "policies": sorted(policies()),
                      "router_loaded": _ROUTER is not None,
                      "device": os.getenv("LAYA_DEVICE") or "auto"})
    except Exception as exc:
        raise _tool_error("internal_error", f"{type(exc).__name__}: {exc}") from exc


def main() -> None:
    if os.name == "nt":
        os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
    if _env_bool("WAYFINDER_PRELOAD", False):
        try:
            r = _ensure_router()
            models = [m.strip() for m in os.getenv("LAYA_MODELS", "english").split(",") if m.strip()]
            try:
                r.preload(models)  # type: ignore[attr-defined]
            except TypeError:
                pass
        except Exception as exc:
            print(f"[wayfinder-mcp] preload failed (retry on demand): {exc}", file=sys.stderr)
    server.run()


if __name__ == "__main__":
    main()
