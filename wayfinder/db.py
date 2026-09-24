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


def _connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def get_engine(url: str | None = None):
    url = url or settings.database_url
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
