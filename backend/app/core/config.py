"""
Application configuration — loaded from environment variables via .env file.

ARCHITECTURE NOTES:
    - database_url: PostgreSQL with pgvector extension for embedding storage
    - redis_url: Redis for RQ background job queue (clustering is async)
    - jwt_secret: MUST be changed in production (generate with: openssl rand -hex 32)
    - cloudinary_*: For encrypted photo blob storage (25GB free tier)
    - data_dir: Local filesystem fallback for development without Cloudinary

V2 ADDITIONS (future):
    - room_expiry_days: How long rooms persist before auto-deletion (default 30)
    - max_room_members: Limit for room membership
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ──────────────────────────────────────────────────────
    app_name: str = "SnapSquad Backend"
    debug: bool = False

    # ── Database (PostgreSQL + pgvector) ─────────────────────────
    # pgvector extension must be enabled: CREATE EXTENSION vector;
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/snapsquad"

    # ── Redis (for RQ background jobs) ───────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Auth ─────────────────────────────────────────────────────
    jwt_secret: str = "change-me"  # MUST override in production
    jwt_algorithm: str = "HS256"
    jwt_exp_minutes: int = 120

    # ── Storage ──────────────────────────────────────────────────
    # Cloudinary credentials (for encrypted photo blob storage)
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # Local filesystem fallback (used when Cloudinary is not configured)
    data_dir: str = "backend_data"

    # ── Pipeline (for snapshot testing only) ─────────────────────
    notebooks_dir: str = "Notebooks"
    embeddings_file: str = "mobilefacenet_embeddings.json"

    # ── V2 Room settings (stubbed for future) ────────────────────
    room_expiry_days: int = 30
    max_room_members: int = 200

    @property
    def cloudinary_configured(self) -> bool:
        """Check if Cloudinary credentials are set."""
        return bool(
            self.cloudinary_cloud_name
            and self.cloudinary_api_key
            and self.cloudinary_api_secret
        )


settings = Settings()
