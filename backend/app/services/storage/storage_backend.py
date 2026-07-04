"""
storage_backend.py — Smart storage dispatcher for SnapSquad.

Automatically selects R2Store (production) or LocalStore (dev fallback)
based on environment configuration.

PRIORITY ORDER:
    1. Cloudflare R2    (if R2_ACCOUNT_ID + R2_ACCESS_KEY + R2_SECRET_KEY are set)
    2. LocalStore       (fallback for dev when R2 is not configured)

BACKWARD COMPATIBILITY:
    Existing albums that were uploaded before R2 was enabled have
    Photo.encrypted_blob_url pointing to a LOCAL filesystem path.
    The get_store_for_path() function handles this: it inspects the stored path
    and returns the correct store to read from.

USAGE:
    from app.services.storage.storage_backend import get_write_store, get_store_for_path

    # For uploads (always use the primary configured store):
    store = get_write_store()
    key = store.save_encrypted_blob(album_id, photo_id, blob)

    # For downloads (detect from the stored URL which store to use):
    store = get_store_for_path(photo.encrypted_blob_url)
    data = store.read_encrypted_blob(photo.encrypted_blob_url)
"""

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_write_store():
    """
    Return the primary storage backend for new uploads.

    Uses R2 if configured, otherwise falls back to LocalStore.
    """
    if settings.r2_configured:
        from app.services.storage.r2_store import R2Store
        return R2Store()
    else:
        logger.warning(
            "[Storage] R2 not configured — falling back to LocalStore. "
            "Set R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY in .env to enable R2."
        )
        from app.services.storage.local_store import LocalStore
        return LocalStore()


def get_store_for_path(encrypted_blob_url: str):
    """
    Return the correct storage backend for reading/deleting a specific blob.

    Inspects the stored URL to determine which backend holds the file:
    - R2 key (e.g. "albums/abc/photo.enc")   → R2Store
    - Local path (e.g. "/srv/data/albums/...") → LocalStore

    This ensures backward compatibility: old photos (stored locally before R2
    was enabled) are served from LocalStore, while new photos come from R2.
    """
    from app.services.storage.r2_store import R2Store
    from app.services.storage.local_store import LocalStore

    if R2Store.is_r2_key(encrypted_blob_url):
        if settings.r2_configured:
            return R2Store()
        else:
            # Path looks like an R2 key (e.g. "albums/abc/photo.enc") but R2 is not configured.
            # This happens when LocalStore saved a relative path. Fall back to LocalStore
            # so it can attempt to resolve the path relative to data_dir.
            logger.warning(
                f"[Storage] Path looks like R2 key ({encrypted_blob_url}) but R2 is not configured. "
                "Falling back to LocalStore — file may not be found if it was stored elsewhere."
            )
            return LocalStore()
    else:
        return LocalStore()
