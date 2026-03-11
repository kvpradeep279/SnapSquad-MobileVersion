"""
Authentication endpoints — signup and login.

V1: Email + password with JWT tokens.
V2: Will add Google OAuth (POST /auth/google).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest

router = APIRouter()


@router.post("/signup", response_model=AuthResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    """Register a new user.

    Returns a JWT access token on success.
    Rejects if email or username already exists.
    """
    exists = db.scalar(
        select(User).where(
            (User.email == payload.email) | (User.username == payload.username)
        )
    )
    if exists:
        raise HTTPException(status_code=400, detail="User already exists")

    user = User(
        email=payload.email,
        username=payload.username,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    return AuthResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Login with email + password.

    Returns JWT access token. Used for authenticating all subsequent requests.
    """
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return AuthResponse(access_token=create_access_token(user.id))


# V2: Google OAuth placeholder — not active in V1
# @router.post("/google", response_model=AuthResponse)
# def google_oauth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
#     pass
