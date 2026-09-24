"""Platform persistence: SQLite by default, Postgres via DATABASE_URL.

SQLite needs zero config for local dev (a file under ./data/). Point
DATABASE_URL (or WAYFINDER_DATABASE_URL) at Postgres in production and the
same models work unchanged.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from wayfinder.config import settings


class Base(DeclarativeBase):
    pass


def _normalize_url(url: str) -> str:
    # Railway's DATABASE_URL is postgresql://… — SQLAlchemy needs an explicit
    # driver. psycopg2-binary ships in our dependencies.
    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://"):]
    return url


def _connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def get_engine(url: str | None = None):
    url = _normalize_url(url or settings.database_url)
    if url.startswith("sqlite"):
        # "sqlite:///./data/wayfinder.db" -> ensure ./data exists.
        path_part = url.split("sqlite:///", 1)[-1].split("?", 1)[0]
        if path_part and path_part != ":memory:":
            Path(path_part).parent.mkdir(parents=True, exist_ok=True)
    return create_engine(url, connect_args=_connect_args(url), pool_pre_ping=True)


engine = get_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import here so models register on Base before create_all.
    from wayfinder import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()


def _ensure_sqlite_columns() -> None:
    """Best-effort ALTERs for dev SQLite files created by older releases
    (create_all never adds columns to existing tables). Postgres deployments
    start from a fresh DB, so this only ever fires locally."""
    if not engine.url.get_backend_name() == "sqlite":
        return
    try:
        from sqlalchemy import inspect, text

        with engine.connect() as conn:
            cols = {c["name"] for c in inspect(conn).get_columns("users")}
            if "external_id" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN external_id VARCHAR(128)"))
                if "clerk_id" in cols:  # carry over pre-SuperTokens dev rows
                    conn.execute(text("UPDATE users SET external_id = clerk_id WHERE external_id IS NULL"))
                conn.commit()
    except Exception:
        pass
