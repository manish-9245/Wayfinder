"""Platform tests: API keys, RBAC, rate limits, quotas, usage/logs, admin.

Isolated: rebinds wayfinder.db.SessionLocal to a tmp SQLite file and enables
WAYFINDER_TEST_AUTH (test-user / test-admin bearers). No core, no torch.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import wayfinder.app as appmod
import wayfinder.db as dbmod
from test_gate import StubRouter
from wayfinder.config import settings
from wayfinder.db import Base
from wayfinder.hooks import LRUCache
from wayfinder.policies import load_policies
from wayfinder.ratelimit import reset_windows


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
    appmod.ROUTER = StubRouter()
    appmod.POLICIES = load_policies("wayfinder/policies.yaml")
    appmod.CACHE = LRUCache(capacity=128)
    reset_windows()
    yield TestClient(appmod.app)  # no `with`: lifespan would boot torch + downloads
    reset_windows()


USER = {"Authorization": "Bearer test-user"}
ADMIN = {"Authorization": "Bearer test-admin"}


def test_keys_crud_and_gateway_use(client):
    created = client.post("/v1/keys", json={"name": "ci"}, headers=USER).json()
    assert created["key"].startswith("wf_") and created["prefix"]
    raw = created["key"]
    assert any(k["prefix"] == created["prefix"] for k in client.get("/v1/keys", headers=USER).json())
    # Service key authenticates inference.
    r = client.post("/v1/decide/support_inbound", json={"state": {"body": "refund pls"}},
                    headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 200, r.text
    # Raw secret is never returned again.
    assert "key" not in client.get("/v1/keys", headers=USER).json()[0]
    # Revoke -> gateway rejects.
    assert client.delete(f"/v1/keys/{created['prefix']}", headers=USER).status_code in (200, 204)
    assert client.post("/v1/decide/support_inbound", json={"state": {"body": "refund pls"}},
                       headers={"Authorization": f"Bearer {raw}"}).status_code == 401


def test_rbac_admin_only(client):
    assert client.get("/v1/admin/overview", headers=USER).status_code == 403
    assert client.get("/v1/admin/overview", headers=ADMIN).status_code == 200
    assert client.get("/v1/me", headers=USER).json()["role"] == "user"
    assert client.get("/v1/me", headers=ADMIN).json()["role"] == "admin"


def test_rate_limit_per_key(client, monkeypatch):
    monkeypatch.setattr(settings, "rate_free_per_min", 2)
    monkeypatch.setattr(settings, "rate_ip_per_min", 0)  # isolate the per-user bucket
    reset_windows()
    body = {"state": {"body": "rate me"}}
    assert client.post("/v1/decide/support_inbound", json=body, headers=USER).status_code == 200
    assert client.post("/v1/decide/support_inbound", json=body, headers=USER).status_code == 200
    r = client.post("/v1/decide/support_inbound", json=body, headers=USER)
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_usage_and_logs_recorded(client):
    client.post("/v1/decide/support_inbound", json={"state": {"body": "log me"}}, headers=USER)
    usage = client.get("/v1/me/usage", headers=USER).json()
    assert usage["totals"]["requests"] >= 1
    assert usage["daily"] and usage["by_policy"]
    logs = client.get("/v1/me/logs", headers=USER).json()
    assert logs["total"] >= 1
    assert logs["logs"][0]["policy"] == "support_inbound"
    assert logs["logs"][0]["state_preview"]  # redacted preview, not raw
    admin_logs = client.get("/v1/admin/logs", headers=ADMIN).json()
    assert admin_logs["total"] >= 1


def test_admin_user_management(client):
    me = client.get("/v1/me", headers=USER).json()
    patched = client.patch(f"/v1/admin/users/{me['id']}", json={"plan": "pro"}, headers=ADMIN).json()
    assert patched["plan"] == "pro"
    assert client.get("/v1/me", headers=USER).json()["plan"] == "pro"
    users = client.get("/v1/admin/users?search=test-user", headers=ADMIN).json()
    assert users["total"] >= 1
    # Cannot demote/disable yourself.
    admin_me = client.get("/v1/me", headers=ADMIN).json()
    assert client.patch(f"/v1/admin/users/{admin_me['id']}", json={"role": "user"}, headers=ADMIN).status_code == 422


def test_monthly_quota_enforced(client, monkeypatch):
    monkeypatch.setattr(settings, "quota_free_monthly", 1)
    monkeypatch.setattr(settings, "rate_ip_per_min", 0)
    reset_windows()
    body = {"state": {"body": "quota me"}}
    assert client.post("/v1/decide/support_inbound", json=body, headers=USER).status_code == 200
    r = client.post("/v1/decide/support_inbound", json={"state": {"body": "quota me again"}}, headers=USER)
    assert r.status_code == 429 and "quota" in r.json()["detail"]


def test_admin_delete_user(client):
    me = client.get("/v1/me", headers=USER).json()
    uid = me["id"]
    # Self-delete is blocked (lockout guard).
    admin_me = client.get("/v1/me", headers=ADMIN).json()
    assert client.delete(f"/v1/admin/users/{admin_me['id']}", headers=ADMIN).status_code == 422
    # Deleting another user removes them + their keys, keeps usage rows.
    client.post("/v1/decide/support_inbound", json={"state": {"body": "bye"}}, headers=USER)
    assert client.delete(f"/v1/admin/users/{uid}", headers=ADMIN).status_code in (200, 204)
    assert client.get("/v1/admin/users?search=test-user", headers=ADMIN).json()["total"] == 0
    assert client.get("/v1/keys", headers=USER).json() == []  # keys gone with user
    assert client.get("/v1/admin/logs", headers=ADMIN).json()["total"] >= 1  # audit kept
