"""Pydantic shapes for the platform API (never leak key hashes or raw states)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class KeyCreate(BaseModel):
    name: str = Field(default="default", max_length=120)


class KeyOut(BaseModel):
    id: int
    name: str
    prefix: str
    is_active: bool
    request_count: int
    last_used_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class KeyCreated(KeyOut):
    key: str  # raw wf_… secret — shown ONCE, never stored or returned again


class AdminKeyOut(KeyOut):
    user_id: int
    email: str = ""


class MeOut(BaseModel):
    id: int
    email: str
    role: str
    plan: str
    quota_monthly: Optional[int] = None
    quota_used: int = 0
    rate_per_min: int = 0
    created_at: Optional[datetime] = None


class UserOut(BaseModel):
    id: int
    email: str
    role: str
    plan: str
    quota_monthly: Optional[int] = None
    is_active: bool
    created_at: Optional[datetime] = None
    keys_count: int = 0
    requests_30d: int = 0


class UserPatch(BaseModel):
    role: Optional[str] = None
    plan: Optional[str] = None
    quota_monthly: Optional[int] = None
    is_active: Optional[bool] = None


class LogOut(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    user_id: Optional[int] = None
    email: str = ""
    key_prefix: Optional[str] = None
    policy: str = ""
    verdict: str = ""
    confidence: Optional[float] = None
    latency_ms: float = 0.0
    cache_hit: bool = False
    blocked: bool = False
    error: bool = False
    status_code: int = 200
    ip: str = ""
    state_preview: str = ""


class PagedLogs(BaseModel):
    total: int
    logs: list[LogOut]


class UsageOut(BaseModel):
    totals: dict[str, Any]
    daily: list[dict[str, Any]]
    by_policy: list[dict[str, Any]]
    by_verdict: list[dict[str, Any]]
    quota_monthly: Optional[int] = None
    quota_used: int = 0
