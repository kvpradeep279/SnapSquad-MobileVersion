"""
Authentication endpoints — signup and login.

V1: Email + password with JWT tokens.
V2: Will add Google OAuth (POST /auth/google).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_current_user_id, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserProfile, UpdateProfileRequest

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


@router.get("/me", response_model=UserProfile)
def get_me(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get the current authenticated user's profile."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(id=user.id, email=user.email, username=user.username)


@router.patch("/me", response_model=UserProfile)
def update_me(
    payload: UpdateProfileRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Update username or password for the current user."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.username is not None:
        # Check uniqueness
        from sqlalchemy import select
        existing = db.scalar(select(User).where(User.username == payload.username))
        if existing and existing.id != user_id:
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = payload.username

    if payload.password is not None:
        user.password_hash = hash_password(payload.password)

    db.commit()
    return UserProfile(id=user.id, email=user.email, username=user.username)


@router.delete("/me/data")
def delete_all_user_data(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Delete ALL data for the current user — albums, photos, faces, clusters, and account."""
    from app.models.album import Album
    from app.models.photo import Photo
    from app.models.face_detection import FaceDetection
    from app.models.cluster import Cluster
    from app.models.edit import ClusterEdit
    from app.models.job import PipelineJob
    from app.models.global_identity import GlobalIdentity
    from app.services.storage.storage_backend import get_store_for_path

    # Get all albums for this user
    albums = db.query(Album).filter(Album.user_id == user_id).all()
    album_ids = [a.id for a in albums]

    for album_id in album_ids:
        # Delete child rows in dependency order
        db.query(FaceDetection).filter(FaceDetection.album_id == album_id).delete()
        db.query(Cluster).filter(Cluster.album_id == album_id).delete()
        db.query(ClusterEdit).filter(ClusterEdit.album_id == album_id).delete()
        db.query(PipelineJob).filter(PipelineJob.album_id == album_id).delete()

        # Delete photo blobs from R2 or local (auto-detected per photo)
        photos = db.query(Photo).filter(Photo.album_id == album_id).all()
        for photo in photos:
            try:
                photo_store = get_store_for_path(photo.encrypted_blob_url)
                photo_store.delete_encrypted_blob(photo.encrypted_blob_url)
            except Exception:
                pass  # Don't block deletion if storage cleanup fails
        db.query(Photo).filter(Photo.album_id == album_id).delete()

    # Delete albums
    db.query(Album).filter(Album.user_id == user_id).delete()

    # Delete global identities BEFORE deleting the user (FK constraint)
    db.query(GlobalIdentity).filter(GlobalIdentity.user_id == user_id).delete()

    # Now safe to delete the user account
    user = db.get(User, user_id)
    if user:
        db.delete(user)

    db.commit()
    return {"success": True, "message": "All data deleted"}


from pydantic import BaseModel
class PushTokenRequest(BaseModel):
    push_token: str

@router.put("/push-token")
def update_push_token(
    payload: PushTokenRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Save the Expo Push Token for the current user."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.push_token = payload.push_token
    db.commit()
    return {"success": True, "message": "Push token updated"}

