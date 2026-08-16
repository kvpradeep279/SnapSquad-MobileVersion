"""
Firebase Admin SDK initialization.

Loaded once at module import time. Used by security.py to verify
Firebase ID tokens sent from the mobile app.

SETUP:
    1. Go to Firebase Console → Project Settings → Service accounts.
    2. Click "Generate new private key" → download JSON file.
    3. Set FIREBASE_CREDENTIALS_JSON env var to the path of that file.
    4. For Cloud Run, mount the file as a secret and point the env var at it.
"""

import firebase_admin
from firebase_admin import credentials

from app.core.config import settings


def _init_firebase() -> firebase_admin.App | None:
    """Initialize the Firebase Admin SDK.

    Returns None if credentials are not configured (local dev without Firebase).
    In production, this MUST succeed or the server cannot verify auth tokens.
    """
    if not settings.firebase_credentials_json:
        import warnings
        warnings.warn(
            "FIREBASE_CREDENTIALS_JSON is not set. "
            "Firebase token verification will be unavailable. "
            "This is only acceptable for local development.",
            stacklevel=2,
        )
        return None

    try:
        cred = credentials.Certificate(settings.firebase_credentials_json)
        return firebase_admin.initialize_app(cred)
    except Exception as e:
        raise RuntimeError(
            f"Failed to initialize Firebase Admin SDK: {e}. "
            f"Check that FIREBASE_CREDENTIALS_JSON points to a valid service account JSON file."
        ) from e


# Initialize on import — this runs once when the app starts.
firebase_app = _init_firebase()
