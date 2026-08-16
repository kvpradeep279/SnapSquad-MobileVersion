"""
Security utilities — Firebase ID token verification.

Replaces the previous custom JWT system. All authentication is now handled
by Firebase Auth on the client side. The backend verifies Firebase ID tokens
using the Firebase Admin SDK.

The get_current_user_id() dependency is used by all protected endpoints
and returns the Firebase UID of the authenticated user.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth

# ── Bearer token scheme ──────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)


def verify_firebase_token(id_token: str) -> dict:
    """Verify a Firebase ID token and return the decoded claims.

    The token is cryptographically verified against Google's public keys.
    Returns a dict containing: uid, email, name, picture, email_verified, etc.

    Raises HTTPException 401 if the token is invalid, expired, or revoked.
    """
    try:
        decoded = firebase_auth.verify_id_token(id_token)
        return decoded
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase token has expired",
        )
    except firebase_auth.RevokedIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase token has been revoked",
        )
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase token",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not verify Firebase token",
        )


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """FastAPI dependency — extract and validate the current user ID from Bearer token.

    The Bearer token is a Firebase ID token sent by the mobile app.
    Returns the Firebase UID (used as the primary user identifier).

    Usage in endpoints:
        @router.get("/protected")
        def protected_endpoint(user_id: str = Depends(get_current_user_id)):
            ...
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
        )
    decoded = verify_firebase_token(credentials.credentials)
    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user ID",
        )
    return uid
