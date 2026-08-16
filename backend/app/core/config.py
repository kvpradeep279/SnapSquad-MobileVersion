"""
Application configuration — loaded from environment variables via .env file.

ARCHITECTURE NOTES:
    - database_url: PostgreSQL with pgvector extension for embedding storage
    - redis_url: Redis for RQ background job queue (clustering is async)
    - firebase_credentials_json: Path to Firebase Admin SDK service account JSON
      (required in production for verifying Firebase ID tokens)
    - r2_*: Cloudflare R2 object storage (S3-compatible, zero egress fees)
      Falls back to local filesystem when not configured.
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
    app_name: str = "Plexida Backend"
    debug: bool = False
    environment: str = "development"  # development | staging | production

    # ── Database (PostgreSQL + pgvector) ─────────────────────────
    # pgvector extension must be enabled: CREATE EXTENSION vector;
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/Plexida"

    # ── Redis (for RQ background jobs) ───────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Auth (Firebase) ──────────────────────────────────────────
    # Path to the Firebase Admin SDK service account JSON file.
    # Download from: Firebase Console → Project Settings → Service accounts
    # In Cloud Run: mount as a secret volume and set path here.
    firebase_credentials_json: str = ""

    # ── Storage: Cloudflare R2 (primary) ─────────────────────────
    # S3-compatible object storage with zero egress fees.
    # Sign up at dash.cloudflare.com → R2 → Create bucket.
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket_name: str = "Plexida-storage"

    # ── Storage: Local filesystem (dev fallback) ──────────────────
    # Used when R2 is not configured.
    data_dir: str = "backend_data"

    # ── Pipeline (for snapshot testing only) ─────────────────────
    notebooks_dir: str = "Notebooks"
    embeddings_file: str = "mobilefacenet_embeddings.json"

    # ── V2 Room settings ─────────────────────────────────────────
    room_expiry_days: int = 30
    max_room_members: int = 200

    # ── Monitoring ───────────────────────────────────────────────
    sentry_dsn: str = ""

    @property
    def r2_configured(self) -> bool:
        """Check if Cloudflare R2 credentials are set."""
        return bool(
            self.r2_account_id
            and self.r2_access_key
            and self.r2_secret_key
        )

    @property
    def r2_endpoint_url(self) -> str:
        """S3-compatible endpoint URL for Cloudflare R2."""
        return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment == "production"


settings = Settings()
