"""
Auth schemas — Firebase authentication and user profile.

Authentication is handled by Firebase Auth (Google Sign-In on the client).
The backend receives Firebase ID tokens and verifies them server-side.
"""

from pydantic import BaseModel
from typing import Optional


class FirebaseAuthRequest(BaseModel):
    """Firebase ID token sent from the mobile app after Google Sign-In.

    The backend verifies this token using the Firebase Admin SDK,
    then creates or retrieves the corresponding User record.
    """
    id_token: str


class UserProfile(BaseModel):
    """Public profile info returned by GET /auth/me and POST /auth/firebase."""
    id: str
    email: str
    username: str
    display_name: str | None = None
    photo_url: str | None = None


class UpdateProfileRequest(BaseModel):
    """Fields the user can update via PATCH /auth/me."""
    username: Optional[str] = None
    display_name: Optional[str] = None
