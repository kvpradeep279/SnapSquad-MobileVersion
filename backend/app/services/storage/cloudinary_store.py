"""
Cloudinary storage — upload/download/delete encrypted photo blobs.

Used in production when Cloudinary credentials are configured.
Falls back to LocalStore when running locally without Cloudinary.

SECURITY:
    Photos are AES-256 encrypted BEFORE upload to Cloudinary.
    Cloudinary stores opaque binary blobs it cannot read.
    The encryption key lives only on the mobile device.

FREE TIER: 25GB storage — sufficient for V1 and V2.

V2 NOTE:
    Photos will be tagged with room_id for efficient per-room queries.
    Cloudinary's tag-based search makes this efficient at scale.
"""

from app.core.config import settings


def get_storage_backend():
    """Return the appropriate storage backend based on configuration.

    Returns CloudinaryStore if credentials are set, LocalStore otherwise.
    Both implement the same interface: save_blob, read_blob, delete_blob.
    """
    if settings.cloudinary_configured:
        return CloudinaryStore()
    else:
        from app.services.storage.local_store import LocalStore
        return LocalStore()


class CloudinaryStore:
    """Cloudinary-backed storage for encrypted photo blobs.

    Only instantiated when CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
    and CLOUDINARY_API_SECRET are all set in .env.
    """

    def __init__(self) -> None:
        # Lazy import — cloudinary package only needed when configured
        import cloudinary
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )

    def save_encrypted_blob(self, album_id: str, photo_id: str, blob: bytes) -> str:
        """Upload encrypted blob to Cloudinary. Returns the secure URL."""
        import cloudinary.uploader

        # Upload as raw file (not image — Cloudinary won't try to process it)
        result = cloudinary.uploader.upload(
            blob,
            resource_type="raw",
            public_id=f"snapsquad/{album_id}/{photo_id}",
            tags=[album_id],
        )
        return result["secure_url"]

    def read_encrypted_blob(self, url: str) -> bytes:
        """Download encrypted blob from Cloudinary URL."""
        import urllib.request
        with urllib.request.urlopen(url) as resp:  # noqa: S310 — URL from our own DB
            return resp.read()

    def delete_encrypted_blob(self, url: str) -> None:
        """Delete encrypted blob from Cloudinary."""
        import cloudinary.uploader
        # Extract public_id from URL for deletion
        # URL format: https://res.cloudinary.com/{cloud}/raw/upload/v{ver}/snapsquad/{album}/{photo}
        parts = url.split("/snapsquad/")
        if len(parts) == 2:
            public_id = "snapsquad/" + parts[1]
            cloudinary.uploader.destroy(public_id, resource_type="raw")
