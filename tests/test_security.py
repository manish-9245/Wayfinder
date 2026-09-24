"""Top-notch guarantees: auth enforcement, security headers, request IDs,
redaction, error hygiene, rate limits, and security-event audit logs.

Isolated like test_platform.py: tmp SQLite, test backdoor auth, stubbed
Router (no torch, no core). Tests that flip WAYFINDER_REQUIRE_AUTH use
monkeypatch so the default-open dev behavior stays intact for test_gate.py.
"""

import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import wayfinder.app as appmod
import wayfinder.db as dbmod
from test_gate import StubRouter
from wayfinder import hooks
from wayfinder.config import settings
from wayfinder.db import Base
from wayfinder.hooks import audit_line, metrics_snapshot, redact_for_log, reset_metrics
from wayfinder.policies import load_policies
from wayfinder.ratelimit import reset_windows as reset_rl_windows


@pytest.fixture()
def client(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/test.db"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    monkeypatch.setattr(dbmod, "SessionLocal", sessionmaker(bind=engine, autoflush=False, autocommit=False))
    from wayfinder import models  # noqa: F401  (register tables)

    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(settings, "test_auth", True)
    monkeypatch.setattr(settings, "supertokens_enabled", False)
    monkeypatch.setattr(settings, "api_key", "")
    monkeypatch.setattr(settings, "require_auth", False)
    appmod.ROUTER = StubRouter()
    appmod.POLICIES = load_policies("wayfinder/policies.yaml")
    appmod.CACHE = hooks.LRUCache(capacity=128)
    reset_metrics()
    reset_rl_windows()
    yield TestClient(appmod.app)
    reset_metrics()
    reset_rl_windows()


USER = {"Authorization": "Bearer test-user"}
DECIDE = ("support_inbound", {"state": {"body": "refund please"}})


def _decide(c, headers=None):
    policy, body = DECIDE
    return c.post(f"/v1/decide/{policy}", json=body, headers=headers)


# ------------------------------------------------------- headers --- #

def test_security_headers_on_all_shapes(client):
    for path, method in [("/health", "get"), ("/policies", "get"), ("/metrics", "get")]:
        r = getattr(client, method)(path)
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["X-Frame-Options"] == "DENY"
        assert r.headers["Referrer-Policy"] == "same-origin"
        assert "camera=()" in r.headers["Permissions-Policy"]
    r = _decide(client)
    assert r.status_code == 200
    assert r.headers["X-Content-Type-Options"] == "nosniff"


def test_request_id_unique_and_echoed(client):
    a = client.get("/health")
    b = client.get("/health")
    assert a.headers["X-Request-ID"] and b.headers["X-Request-ID"]
    assert a.headers["X-Request-ID"] != b.headers["X-Request-ID"]
    echo = client.get("/health", headers={"X-Request-ID": "trace-123"})
    assert echo.headers["X-Request-ID"] == "trace-123"
    r = _decide(client, headers={"X-Request-ID": "trace-abc"})
    assert r.headers["X-Request-ID"] == "trace-abc"


# ---------------------------------------------------------- auth --- #

def test_require_auth_blocks_anonymous_everywhere(client, monkeypatch):
    monkeypatch.setattr(settings, "require_auth", True)
    assert _decide(client).status_code == 401
    assert "sign-in required" in _decide(client).json()["detail"]
    assert client.post("/v1/systemone", json={"state": "x", "questions": {"a": {"type": "noul"}}}).status_code == 401
    assert client.post("/predict", json={"state": "x", "questions": {"a": {"type": "noul"}}}).status_code == 401
    assert client.post("/predict/batch", json={"states": ["x"], "policy": "support_inbound"}).status_code == 401
    # ...but an authenticated caller still passes.
    assert _decide(client, headers=USER).status_code == 200
    snap = metrics_snapshot()
    assert snap["rejected_401"] >= 4


def test_invalid_bearer_rejected(client, monkeypatch):
    monkeypatch.setattr(settings, "require_auth", True)
    r = _decide(client, headers={"Authorization": "Bearer wf_bogus"})
    assert r.status_code == 401


def test_catalog_stays_public(client, monkeypatch):
    """Policies/health/metrics describe the service; only inference hits need identity."""
    monkeypatch.setattr(settings, "require_auth", True)
    assert client.get("/health").status_code == 200
    assert client.get("/policies").status_code == 200


# ------------------------------------------------------- hygiene --- #

def test_500_never_leaks_internals(client, monkeypatch):
    class ExplodingRouter(StubRouter):
        def predict(self, *a, **k):
            raise RuntimeError("super secret internals at /etc/hidden")

    monkeypatch.setattr(appmod, "ROUTER", ExplodingRouter())
    r = _decide(client, headers=USER)
    assert r.status_code == 500
    assert r.json() == {"detail": "internal inference error"}
    assert "secret" not in r.text


def test_redaction_covers_email_card_phone():
    assert redact_for_log("mail a@b.com now") == "mail [email] now"
    assert redact_for_log("card 4111 1111 1111 1111 ok") == "card [card] ok"
    assert "[phone]" in redact_for_log("call +1 415 555 0132 today")


def test_audit_line_redacts_and_carries_rid():
    hooks.req_id_ctx.set("rid-1")
    try:
        line = audit_line("support_inbound", {"body": "mail a@b.com"}, {"verdict": "act", "confidence": 0.9, "trigger": "x"}, 3.0)
    finally:
        hooks.req_id_ctx.set("-")
    assert "rid=rid-1" in line
    assert "a@b.com" not in line and "[email]" in line


def test_metrics_track_policy_and_rejections(client, monkeypatch):
    monkeypatch.setattr(settings, "require_auth", True)
    reset_metrics()
    _decide(client)  # 401
    _decide(client, headers=USER)  # 200 x2 (same state also exercises cache path)
    _decide(client, headers=USER)
    snap = metrics_snapshot()
    assert snap["rejected_401"] == 1
    assert snap["by_policy"].get("support_inbound", 0) >= 2


def test_ip_rate_limit_backstop(client, monkeypatch):
    monkeypatch.setattr(settings, "rate_ip_per_min", 2)
    reset_rl_windows()
    assert _decide(client).status_code == 200
    assert _decide(client).status_code == 200
    r = _decide(client)
    assert r.status_code == 429 and "Retry-After" in r.headers
    assert metrics_snapshot()["rejected_429"] >= 1


def test_key_lifecycle_emits_security_audit(client, caplog):
    created = client.post("/v1/keys", json={"name": "audit"}, headers=USER).json()
    with caplog.at_level(logging.WARNING, logger="wayfinder"):
        assert client.delete(f"/v1/keys/{created['prefix']}", headers=USER).status_code in (200, 204)
    assert "key.revoked" in caplog.text and created["prefix"] in caplog.text


# --------------------------------------------------------- redis --- #

class _FakeRedis:
    """Minimal in-memory stand-in for the counter commands the limiter uses."""

    def __init__(self):
        self.counts: dict[str, int] = {}
        self.ttls: dict[str, int] = {}

    def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    def expire(self, key, secs):
        self.ttls[key] = secs

    def ttl(self, key):
        return self.ttls.get(key, -1)


class _DeadRedis:
    def incr(self, key):
        raise ConnectionError("redis is down")

    def expire(self, key, secs):
        raise ConnectionError("redis is down")

    def ttl(self, key):
        raise ConnectionError("redis is down")


def test_redis_limits_are_shared_across_replicas(client, monkeypatch):
    from wayfinder import ratelimit

    fake = _FakeRedis()
    monkeypatch.setattr(ratelimit, "_redis", lambda: fake)
    monkeypatch.setattr(settings, "rate_ip_per_min", 0)  # isolate the identity bucket
    monkeypatch.setattr(settings, "rate_free_per_min", 2)
    reset_rl_windows()
    assert _decide(client, headers=USER).status_code == 200
    assert _decide(client, headers=USER).status_code == 200
    r = _decide(client, headers=USER)
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_redis_failure_fails_open_and_counts(client, monkeypatch):
    from wayfinder import ratelimit

    monkeypatch.setattr(ratelimit, "_redis", lambda: _DeadRedis())
    reset_metrics()
    reset_rl_windows()
    assert _decide(client, headers=USER).status_code == 200  # memory path saves us
    assert metrics_snapshot()["redis_errors"] >= 1


# ----------------------------------------------------------- mcp --- #

def test_hosted_mcp_needs_identity(client, monkeypatch):
    monkeypatch.setattr(settings, "require_auth", True)
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"})
    assert r.status_code == 401
    assert "X-Request-ID" in r.headers
    assert r.headers["X-Content-Type-Options"] == "nosniff"


def test_hosted_mcp_rejects_bad_key(client, monkeypatch):
    monkeypatch.setattr(settings, "require_auth", True)
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
                    headers={"Authorization": "Bearer wf_nope"})
    assert r.status_code == 401
