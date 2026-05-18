"""
Application configuration — loaded from environment variables via .env file.

ARCHITECTURE NOTES:
    - database_url: PostgreSQL with pgvector extension for embedding storage
    - redis_url: Redis for RQ background job queue (clustering is async)
    - jwt_secret: MUST be changed in production (generate with: openssl rand -hex 32)
    - r2_*: Cloudflare R2 object storage (S3-compatible, zero egress fees)
      Replaces Cloudinary for V2. Falls back to local filesystem when not configured.
    - data_dir: Local filesystem fallback for development without R2

V2 ADDITIONS:
    - room_expiry_days: How long rooms persist before auto-deletion (default 30)
    - max_room_members: Limit for room membership
    - r2_*: Cloudflare R2 storage for scalable encrypted photo blob hosting
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

    # ── Storage: Cloudflare R2 (primary, V2) ─────────────────────
    # S3-compatible object storage with zero egress fees.
    # Sign up at dash.cloudflare.com → R2 → Create bucket.
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket_name: str = "snapsquad-storage"

    # ── Storage: Cloudinary (legacy, kept for backward compat) ────
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # ── Storage: Local filesystem (dev fallback) ──────────────────
    # Used when neither R2 nor Cloudinary is configured.
    data_dir: str = "backend_data"

    # ── Pipeline (for snapshot testing only) ─────────────────────
    notebooks_dir: str = "Notebooks"
    embeddings_file: str = "mobilefacenet_embeddings.json"

    # ── V2 Room settings ─────────────────────────────────────────
    room_expiry_days: int = 30
    max_room_members: int = 200

    @property
    def r2_configured(self) -> bool:
        """Check if Cloudflare R2 credentials are set."""
        return bool(
            self.r2_account_id
            and self.r2_access_key
            and self.r2_secret_key
        )

    @property
    def cloudinary_configured(self) -> bool:
        """Check if Cloudinary credentials are set (legacy)."""
        return bool(
            self.cloudinary_cloud_name
            and self.cloudinary_api_key
            and self.cloudinary_api_secret
        )


settings = Settings()
