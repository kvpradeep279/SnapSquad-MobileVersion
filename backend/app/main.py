"""
SnapSquad Backend — FastAPI application factory.

ARCHITECTURE SUMMARY:
    This server is a BLIND COORDINATOR. It:
        - Stores encrypted photo blobs it CANNOT read (AES-256)
        - Stores protected embeddings it CANNOT invert (feature subtraction)
        - Runs HDBSCAN clustering on protected embeddings (pure math, 0 ML models)

    All face detection (SCRFD-2.5GF) and embedding extraction (MobileFaceNet)
    happen on the MOBILE DEVICE. The server has zero ML model files.

V1 (current):
    Single-user photo album with face clustering.
    Endpoints: /auth, /albums, /albums/*/clusters

V2 (future):
    Group rooms with multi-user collaboration.
    Will add: /rooms endpoints (create, join, register, browse, download)

STARTUP:
    Tables are auto-created on startup via create_all() for development.
    Use Alembic migrations for production schema changes.
"""

from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
from app import models  # noqa: F401 — registers all models with SQLAlchemy


def create_app() -> FastAPI:
    """Application factory — creates and configures the FastAPI app."""
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Face-based group photo organisation backend. Zero ML on server.",
    )

    @app.on_event("startup")
    def on_startup() -> None:
        """Create database tables on startup (development mode).

        In production, use Alembic migrations instead:
            alembic upgrade head
        """
        Base.metadata.create_all(bind=engine)

    # ── Register API routes ──────────────────────────────────────
    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()
