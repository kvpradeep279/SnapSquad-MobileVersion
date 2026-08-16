"""
Authentication endpoints — Firebase token exchange and user management.

FLOW:
    1. Mobile app signs in via Google Sign-In → gets a Firebase ID token.
    2. App sends the Firebase ID token to POST /auth/firebase.
    3. Backend verifies the token via Firebase Admin SDK.
    4. Backend creates a User row on first login (upsert pattern).
    5. Returns the UserProfile.

All subsequent API requests use the Firebase ID token as the Bearer token,
verified by the get_current_user_id() dependency in security.py.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id, verify_firebase_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import FirebaseAuthRequest, UserProfile, UpdateProfileRequest

router = APIRouter()


@router.post("/firebase", response_model=UserProfile)
def firebase_auth(payload: FirebaseAuthRequest, db: Session = Depends(get_db)):
    """Exchange a Firebase ID token for a Plexida user profile.

    On first login, automatically creates a new User record using the
    profile info from the Firebase/Google account.

    On subsequent logins, returns the existing user profile.
    """
    # Verify the Firebase ID token server-side
    decoded = verify_firebase_token(payload.id_token)
    firebase_uid = decoded["uid"]
    email = decoded.get("email", "")
    name = decoded.get("name", "")
    picture = decoded.get("picture", "")

    # Check if user already exists
    user = db.get(User, firebase_uid)

    if user:
        # Existing user — update cached Google profile fields if they changed
        if name and user.display_name != name:
            user.display_name = name
        if picture and user.photo_url != picture:
            user.photo_url = picture
        db.commit()
    else:
        # First login — create new user
        # Generate a username from the email prefix (ensure uniqueness)
        base_username = email.split("@")[0] if email else f"user_{firebase_uid[:8]}"
        username = base_username

        # Check for username collisions and append a suffix if needed
        counter = 1
        while db.scalar(select(User).where(User.username == username)):
            username = f"{base_username}_{counter}"
            counter += 1

        user = User(
            id=firebase_uid,
            email=email,
            username=username,
            display_name=name or None,
            photo_url=picture or None,
        )
        db.add(user)
        db.commit()

    return UserProfile(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        photo_url=user.photo_url,
    )


@router.get("/me", response_model=UserProfile)
def get_me(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get the current authenticated user's profile."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        photo_url=user.photo_url,
    )


@router.patch("/me", response_model=UserProfile)
def update_me(
    payload: UpdateProfileRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Update username or display name for the current user."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.username is not None:
        # Check uniqueness
        existing = db.scalar(select(User).where(User.username == payload.username))
        if existing and existing.id != user_id:
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = payload.username

    if payload.display_name is not None:
        user.display_name = payload.display_name

    db.commit()
    return UserProfile(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        photo_url=user.photo_url,
    )


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
