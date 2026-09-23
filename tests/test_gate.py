"""No-weights tests: policies, verdicts, validation, cache, auth shape.

These run in milliseconds with a stubbed Router (no torch, no downloads),
so they belong in CI. Weight-backed e2e (real Router + 1 predict per policy)
lives outside CI — run it locally with WAYFINDER_E2E=1.
"""

from fastapi.testclient import TestClient

import pytest

import wayfinder.app as appmod
from wayfinder.hooks import LRUCache, cache_key, redact_for_log
from wayfinder.policies import load_policies, verdict_for


class StubRouter:
    def predict(self, state, questions, **kw):
        answers = {}
        for name, q in questions.items():
            t = q.get("type")
            if t == "choice":
                labels = list((q.get("criteria") or {}).keys())
                answers[name] = {"type": "choice", "choice": labels[0] if labels else "x",
                                 "probabilities": {l: (0.9 if i == 0 else 0.1) for i, l in enumerate(labels)} or {"x": 1.0},
                                 "confidence": 0.9}
            elif t == "score":
                answers[name] = {"type": "score", "score": 0.2, "probabilities": {"0": 0.8, "1": 0.2}, "confidence": 0.8}
            else:
                answers[name] = {"type": "noul", "noul": 0.05, "confidence": 0.95}
        return {"answers": answers, "routing": {"model": "english"}, "usage": {}}

    def predict_batch(self, requests):
        return [self.predict(r["state"], r["questions"]) for r in requests]


def _client(**env):
    appmod.ROUTER = StubRouter()
    appmod.POLICIES = load_policies("wayfinder/policies.yaml")
    appmod.CACHE = LRUCache(capacity=128)
    return TestClient(appmod.app)


def test_policies_load_and_validate():
    pols = load_policies("wayfinder/policies.yaml")
    assert {"llm_firewall", "support_inbound", "model_router", "content_safety"} <= set(pols)


def test_firewall_blocks_high_risk():
    pol = load_policies("wayfinder/policies.yaml")["llm_firewall"]
    v = verdict_for(pol, {"jailbreak": {"type": "noul", "noul": 0.97, "confidence": 0.97}})
    assert v["verdict"] == "block" and v["trigger"] == "jailbreak"


def test_firewall_allows_benign():
    pol = load_policies("wayfinder/policies.yaml")["llm_firewall"]
    v = verdict_for(pol, {"jailbreak": {"type": "noul", "noul": 0.02, "confidence": 0.98}})
    assert v["verdict"] == "allow"


def test_decide_endpointsseek():
    c = _client()
    assert c.get("/health").json()["status"] == "ready"
    assert "support_inbound" in c.get("/policies").json()
    r = c.post("/v1/decide/support_inbound", json={"state": {"body": "refund please"}})
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"]["verdict"] in ("act", "review", "escalate")
    assert body["answers"]["department"]["choice"] == "billing"
    # second identical call is a cache hit (no torch in prod either)
    r2 = c.post("/v1/decide/support_inbound", json={"state": {"body": "refund please"}})
    assert r2.json()["cache_hit"] is True


def test_systemone_jev_shape():
    c = _client()
    r = c.post("/v1/systemone", json={"state": {"body": "hi"},
                                      "questions": {"a": {"type": "noul", "instructions": "x?"}}})
    assert r.status_code == 200
    assert "answers" in r.json() and "usage" in r.json()


def test_validation():
    c = _client()
    assert c.post("/v1/decide/nope", json={"state": "x"}).status_code == 422
    assert c.post("/v1/decide/support_inbound", json={"state": ""}).status_code == 422


def test_batch():
    c = _client()
    r = c.post("/predict/batch", json={"states": [{"body": "a"}, {"body": "b"}],
                                        "policy": "support_inbound"})
    assert r.json()["count"] == 2


def test_policies_full_schema():
    c = _client()
    full = c.get("/policies?full=1").json()
    qs = full["support_inbound"]["questions"]
    assert qs["department"]["type"] == "choice"
    assert qs["urgency"]["type"] == "score"
    assert qs["churn_risk"]["type"] == "noul"


def test_docs_files():
    c = _client()
    r = c.get("/docs-files/API.md")
    assert r.status_code == 200 and "decide" in r.text.lower()
    assert c.get("/docs-files/../../etc/passwd").status_code in (404, 422)


def test_mcp_tools_registered():
    pytest.importorskip("mcp")
    from wayfinder import mcp_server
    assert {"wayfinder_decide_tool", "wayfinder_predict_tool", "wayfinder_route_tool",
            "wayfinder_policies_tool", "wayfinder_status_tool"} <= set(dir(mcp_server))
    assert "support_inbound" in mcp_server.policies()


def test_redaction():
    assert redact_for_log("mail me at a@b.com") == "mail me at [email]"


def test_cache_key_stable():
    assert cache_key("a", {"q": 1}) == cache_key("a", {"q": 1})
