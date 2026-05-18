"""
R2Store — Cloudflare R2 object storage backend (S3-compatible).

Replaces LocalStore for production photo blob storage.

DESIGN:
    - All photos are stored as keys like: albums/{album_id}/{photo_id}.enc
    - The server stores and serves blobs it CANNOT decrypt (encryption is on device).
    - Zero egress fees with Cloudflare R2 (critical for shared-album downloads in V2).
    - Backward-compatible with LocalStore: if encrypted_blob_url looks like a
      filesystem path (starts with / or contains a drive letter), callers should
      use LocalStore instead.

EDGE CASES HANDLED:
    - Connection timeout: raises StorageError with a clear message.
    - Bucket not found: raises StorageError — check R2_BUCKET_NAME in .env.
    - Missing credentials: fails at startup with clear config error.
    - Large blobs: boto3 streams uploads in chunks automatically (no memory spike).
    - Re-upload of same key: overwrites silently (idempotent, safe for retries).
    - Delete of non-existent key: no-ops silently (safe for retry/cleanup flows).

KEY FORMAT:
    R2 object keys look like:  albums/abc-123/photo-456.enc
    Stored in DB as:           albums/abc-123/photo-456.enc   (no prefix)

    Detection: if encrypted_blob_url does NOT start with "/" and does NOT contain
    a drive letter pattern (e.g. "C:\\"), it's an R2 key.
"""

import io
import logging

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """Raised when an R2 storage operation fails."""


class R2Store:
    """Cloudflare R2 storage for encrypted photo blobs."""

    def __init__(self) -> None:
        if not settings.r2_configured:
            raise StorageError(
                "Cloudflare R2 is not configured. "
                "Set R2_ACCOUNT_ID, R2_ACCESS_KEY, and R2_SECRET_KEY in your .env file."
            )

        self._bucket = settings.r2_bucket_name
        self._endpoint = (
            f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
        )

        # Configure boto3 with sensible timeouts for mobile upload scenarios
        self._client = boto3.client(
            "s3",
            endpoint_url=self._endpoint,
            aws_access_key_id=settings.r2_access_key,
            aws_secret_access_key=settings.r2_secret_key,
            region_name="auto",  # R2 does not require a real region
            config=Config(
                connect_timeout=10,
                read_timeout=60,
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )

    # ── Key helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _make_key(album_id: str, photo_id: str) -> str:
        """Build the R2 object key for a photo blob."""
        return f"albums/{album_id}/{photo_id}.enc"

    @staticmethod
    def is_r2_key(path: str) -> bool:
        """
        Return True if path is an R2 object key, False if it's a local path.

        R2 key:   albums/abc-123/photo-456.enc    → True
        Local:    /srv/backend_data/albums/...    → False
        Local:    C:\\backend_data\\albums\\...   → False
        """
        if not path:
            return False
        # Local absolute path on Linux/Mac
        if path.startswith("/"):
            return False
        # Local absolute path on Windows (e.g. C:\...)
        if len(path) >= 2 and path[1] == ":":
            return False
        # Local relative path starting with 'backend_data'
        if path.startswith("backend_data"):
            return False
        return True

    # ── Upload ────────────────────────────────────────────────────────────────

    def save_encrypted_blob(
        self, album_id: str, photo_id: str, blob: bytes
    ) -> str:
        """
        Upload an encrypted photo blob to R2.

        Returns the R2 object key (stored in Photo.encrypted_blob_url).
        Raises StorageError on failure.
        """
        key = self._make_key(album_id, photo_id)
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=blob,
                ContentType="application/octet-stream",
            )
            logger.info("[R2] Uploaded %s (%d bytes)", key, len(blob))
            return key
        except ClientError as exc:
            error_code = exc.response["Error"]["Code"]
            if error_code == "NoSuchBucket":
                raise StorageError(
                    f"R2 bucket '{self._bucket}' not found. "
                    "Create it in the Cloudflare dashboard and check R2_BUCKET_NAME in .env."
                ) from exc
            raise StorageError(f"R2 upload failed [{error_code}]: {exc}") from exc
        except BotoCoreError as exc:
            raise StorageError(f"R2 connection error during upload: {exc}") from exc

    # ── Download ──────────────────────────────────────────────────────────────

    def read_encrypted_blob(self, key: str) -> bytes:
        """
        Download an encrypted photo blob from R2.

        Raises StorageError if the key does not exist or connection fails.
        """
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
            data = response["Body"].read()
            logger.debug("[R2] Downloaded %s (%d bytes)", key, len(data))
            return data
        except ClientError as exc:
            error_code = exc.response["Error"]["Code"]
            if error_code in ("NoSuchKey", "404"):
                raise StorageError(
                    f"R2 object not found: {key}"
                ) from exc
            raise StorageError(f"R2 download failed [{error_code}]: {exc}") from exc
        except BotoCoreError as exc:
            raise StorageError(f"R2 connection error during download: {exc}") from exc

    def stream_encrypted_blob(self, key: str):
        """
        Return a streaming body for an R2 object (for large file serving).

        Returns (streaming_body, content_length) tuple.
        Use this for FastAPI StreamingResponse to avoid loading the full file in RAM.
        """
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
            return response["Body"], response.get("ContentLength", 0)
        except ClientError as exc:
            error_code = exc.response["Error"]["Code"]
            if error_code in ("NoSuchKey", "404"):
                raise StorageError(f"R2 object not found: {key}") from exc
            raise StorageError(f"R2 stream failed [{error_code}]: {exc}") from exc
        except BotoCoreError as exc:
            raise StorageError(f"R2 connection error during stream: {exc}") from exc

    # ── Delete ────────────────────────────────────────────────────────────────

    def delete_encrypted_blob(self, key: str) -> None:
        """
        Delete an encrypted photo blob from R2.

        No-ops silently if the key doesn't exist (safe for retry/cleanup).
        Raises StorageError on unexpected failures.
        """
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
            logger.info("[R2] Deleted %s", key)
        except ClientError as exc:
            error_code = exc.response["Error"]["Code"]
            # 404 / NoSuchKey is fine — already deleted
            if error_code not in ("NoSuchKey", "404"):
                raise StorageError(
                    f"R2 delete failed [{error_code}]: {exc}"
                ) from exc
        except BotoCoreError as exc:
            raise StorageError(f"R2 connection error during delete: {exc}") from exc

    # ── Health Check ──────────────────────────────────────────────────────────

    def health_check(self) -> dict:
        """
        Verify R2 connectivity and bucket existence.

        Returns {"status": "ok", "bucket": name} on success.
        Raises StorageError on failure.
        """
        try:
            self._client.head_bucket(Bucket=self._bucket)
            return {"status": "ok", "bucket": self._bucket}
        except ClientError as exc:
            error_code = exc.response["Error"]["Code"]
            if error_code in ("404", "NoSuchBucket"):
                raise StorageError(
                    f"R2 bucket '{self._bucket}' not found or inaccessible."
                ) from exc
            raise StorageError(
                f"R2 health check failed [{error_code}]: {exc}"
            ) from exc
        except BotoCoreError as exc:
            raise StorageError(f"R2 connection error: {exc}") from exc
