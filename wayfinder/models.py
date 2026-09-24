"""Platform tables: users (mirrored from SuperTokens), API keys, request logs.

Users are provisioned on first sight from a verified SuperTokens session —
the DB never stores passwords. API keys are `wf_…` random secrets; only a
sha256 hash is stored, the raw secret is shown once at creation.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from wayfinder.db import Base

ROLE_USER = "user"
ROLE_ADMIN = "admin"

PLAN_FREE = "free"
PLAN_PRO = "pro"
PLAN_ENTERPRISE = "enterprise"

PLANS = (PLAN_FREE, PLAN_PRO, PLAN_ENTERPRISE)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    external_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(16), default=ROLE_USER, index=True)
    plan: Mapped[str] = mapped_column(String(16), default=PLAN_FREE, index=True)
    quota_monthly: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    keys: Mapped[list["ApiKey"]] = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), default="default")
    prefix: Mapped[str] = mapped_column(String(24), unique=True, index=True)  # e.g. wf_a1b2c3d4
    key_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)  # sha256(raw)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    request_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship("User", back_populates="keys")


class UsageEvent(Base):
    """One row per inference call (plus 429/5xx rejections). state_preview is
    PII-scrubbed and truncated — never the raw state."""

    __tablename__ = "usage_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    key_prefix: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    policy: Mapped[str] = mapped_column(String(64), default="", index=True)
    verdict: Mapped[str] = mapped_column(String(16), default="", index=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[bool] = mapped_column(Boolean, default=False)
    status_code: Mapped[int] = mapped_column(Integer, default=200)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    state_preview: Mapped[str] = mapped_column(Text, default="")


Index("ix_usage_user_created", UsageEvent.user_id, UsageEvent.created_at)
Index("ix_usage_policy_created", UsageEvent.policy, UsageEvent.created_at)
