"""
Auth schemas — signup, login, and token responses.

V1: Email + password authentication.
V2: May add Google OAuth token exchange.
"""

from pydantic import BaseModel, EmailStr
from typing import Optional


class SignupRequest(BaseModel):
    """New user registration."""
    email: EmailStr
    username: str
    password: str


class LoginRequest(BaseModel):
    """User login with email + password."""
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    """JWT token returned after successful auth."""
    access_token: str
    token_type: str = "bearer"


class UserProfile(BaseModel):
    """Public profile info returned by GET /auth/me."""
    id: str
    email: str
    username: str


class UpdateProfileRequest(BaseModel):
    """Fields the user can update via PATCH /auth/me."""
    username: Optional[str] = None
    password: Optional[str] = None
