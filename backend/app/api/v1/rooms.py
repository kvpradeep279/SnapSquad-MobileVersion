"""
Rooms API — V2 collaborative photo sharing.

ENDPOINTS:
    POST   /rooms/                              — Create room + shadow album
    GET    /rooms/                              — List my rooms
    GET    /rooms/{room_id}                     — Room detail
    DELETE /rooms/{room_id}                     — Creator: delete room + all data

    GET    /rooms/{room_id}/qr                  — Creator: get QR payload
    POST   /rooms/{room_id}/request-join        — Request to join a room
    GET    /rooms/{room_id}/requests            — Creator: list pending requests
    POST   /rooms/{room_id}/members/{uid}/approve — Creator: approve join request
    POST   /rooms/{room_id}/members/{uid}/reject  — Creator: reject join request
    DELETE /rooms/{room_id}/leave               — Member: leave room
    GET    /rooms/{room_id}/members             — List approved members

    POST   /rooms/{room_id}/photos/upload       — Upload photos (approved members)
    GET    /rooms/{room_id}/photos              — List all room photos
    GET    /rooms/{room_id}/photos/{photo_id}/raw — Serve raw blob
    POST   /rooms/{room_id}/process            — Trigger clustering pipeline
    GET    /rooms/{room_id}/status             — Pipeline status
    GET    /rooms/{room_id}/clusters           — Get clusters for room
"""

import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.album import Album
from app.models.cluster import Cluster
from app.models.face_detection import FaceDetection
from app.models.job import PipelineJob
from app.models.photo import Photo
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.user import User
from app.services.storage.storage_backend import get_store_for_path, get_write_store
from app.services.notifications import send_push_notification

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    name: str
    room_type: str = "shared"  # "shared" or "event"


class RoomSummary(BaseModel):
    id: str
    name: str
    room_type: str
    status: str
    created_by: str
    shadow_album_id: Optional[str]
    member_count: int
    photo_count: int
    expires_at: Optional[datetime]
    created_at: datetime
    my_role: str
    my_status: str


class RoomBasicInfo(BaseModel):
    id: str
    name: str
    room_type: str


class MemberSummary(BaseModel):
    user_id: str
    display_name: str
    role: str
    status: str
    joined_at: datetime


class PhotoSummary(BaseModel):
    id: str
    encrypted_blob_url: str
    face_count: int
    original_filename: str
    uploader_id: str
    uploader_name: str
    created_at: datetime


class ClusterSummary(BaseModel):
    id: str
    cluster_label: int
    display_name: str
    face_count: int
    representative_face: dict | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_member(db: Session, room_id: str, user_id: str) -> Optional[RoomMember]:
    return (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
        .first()
    )


def _require_approved_member(db: Session, room_id: str, user_id: str) -> RoomMember:
    member = _get_member(db, room_id, user_id)
    if not member or member.status != "approved":
        raise HTTPException(status_code=403, detail="Not an approved room member")
    return member


def _require_creator(db: Session, room_id: str, user_id: str) -> RoomMember:
    member = _get_member(db, room_id, user_id)
    if not member or member.role != "creator":
        raise HTTPException(status_code=403, detail="Only the room creator can do this")
    return member


def _get_active_room(db: Session, room_id: str) -> Room:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.status == "expired":
        raise HTTPException(status_code=410, detail="Room has expired")
    if room.status == "deleted":
        raise HTTPException(status_code=404, detail="Room not found")
    return room


def _approved_count(db: Session, room_id: str) -> int:
    return (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room_id, RoomMember.status == "approved")
        .count()
    )


def _photo_count(db: Session, shadow_album_id: Optional[str]) -> int:
    if not shadow_album_id:
        return 0
    return db.query(Photo).filter(Photo.album_id == shadow_album_id).count()


# ─────────────────────────────────────────────────────────────────────────────
# Room CRUD
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/", response_model=dict)
def create_room(
    payload: CreateRoomRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Create a new room. Atomically:
    1. Create a hidden shadow album (owned by creator)
    2. Create the Room linked to that album
    3. Add creator as an approved member with role=creator
    Returns the QR payload (room_id + room_name) for sharing.
    """
    if payload.room_type not in ("shared", "event"):
        raise HTTPException(status_code=400, detail="room_type must be 'shared' or 'event'")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Determine auto-expiry
    expiry_days = 90 if payload.room_type == "shared" else 30
    expires_at = datetime.now(timezone.utc) + timedelta(days=expiry_days)

    # 1. Create shadow album
    shadow_album = Album(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=f"[Room] {payload.name}",
        status="created",
    )
    db.add(shadow_album)
    db.flush()  # Get shadow_album.id before committing

    # 2. Create room
    room = Room(
        id=str(uuid.uuid4()),
        name=payload.name,
        room_type=payload.room_type,
        created_by=user_id,
        shadow_album_id=shadow_album.id,
        auto_delete_days=expiry_days,
        expires_at=expires_at,
        status="active",
    )
    db.add(room)

    # Update shadow album with room_id back-reference
    shadow_album.room_id = room.id

    # 3. Add creator as approved member
    creator_member = RoomMember(
        room_id=room.id,
        user_id=user_id,
        role="creator",
        status="approved",
        display_name=user.username,
    )
    db.add(creator_member)
    db.commit()

    return {
        "room_id": room.id,
        "room_name": room.name,
        "room_type": room.room_type,
        "shadow_album_id": shadow_album.id,
        "expires_at": expires_at.isoformat(),
        # QR payload — embed this JSON in the QR code displayed to creator.
        # room_key is used by ALL members as the shared permutation key for
        # privacy-preserving embeddings. Using room_id in V2 (real random key in V3).
        "qr_payload": json.dumps({
            "room_id": room.id, 
            "room_name": room.name, 
            "room_key": room.id,
            "room_type": room.room_type
        }),
    }


@router.get("/", response_model=List[RoomSummary])
def list_my_rooms(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all rooms where the current user is an approved member."""
    memberships = (
        db.query(RoomMember)
        .filter(RoomMember.user_id == user_id, RoomMember.status == "approved")
        .all()
    )

    result = []
    for m in memberships:
        room = db.get(Room, m.room_id)
        if not room or room.status == "deleted":
            continue
        result.append(
            RoomSummary(
                id=room.id,
                name=room.name,
                room_type=room.room_type,
                status=room.status,
                created_by=room.created_by,
                shadow_album_id=room.shadow_album_id,
                member_count=_approved_count(db, room.id),
                photo_count=_photo_count(db, room.shadow_album_id),
                expires_at=room.expires_at,
                created_at=room.created_at,
                my_role=m.role,
                my_status=m.status,
            )
        )
    return result


@router.get("/{room_id}/info", response_model=RoomBasicInfo)
def get_room_basic_info(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Fetch basic info (name, type) for joining a room (does not require membership)."""
    room = _get_active_room(db, room_id)
    return RoomBasicInfo(
        id=room.id,
        name=room.name,
        room_type=room.room_type,
    )


@router.get("/{room_id}", response_model=RoomSummary)
def get_room(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    room = _get_active_room(db, room_id)
    member = _require_approved_member(db, room_id, user_id)
    return RoomSummary(
        id=room.id,
        name=room.name,
        room_type=room.room_type,
        status=room.status,
        created_by=room.created_by,
        shadow_album_id=room.shadow_album_id,
        member_count=_approved_count(db, room_id),
        photo_count=_photo_count(db, room.shadow_album_id),
        expires_at=room.expires_at,
        created_at=room.created_at,
        my_role=member.role,
        my_status=member.status,
    )


@router.delete("/{room_id}")
def delete_room(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Creator-only: hard delete room and ALL associated data (photos, faces, clusters)."""
    room = _get_active_room(db, room_id)
    _require_creator(db, room_id, user_id)

    # Delete all blobs from R2/local
    if room.shadow_album_id:
        photos = db.query(Photo).filter(Photo.album_id == room.shadow_album_id).all()
        for photo in photos:
            try:
                store = get_store_for_path(photo.encrypted_blob_url)
                store.delete_encrypted_blob(photo.encrypted_blob_url)
            except Exception:
                pass

        # Cascade delete DB records
        db.query(FaceDetection).filter(FaceDetection.album_id == room.shadow_album_id).delete()
        db.query(Cluster).filter(Cluster.album_id == room.shadow_album_id).delete()
        db.query(PipelineJob).filter(PipelineJob.album_id == room.shadow_album_id).delete()
        db.query(Photo).filter(Photo.album_id == room.shadow_album_id).delete()
        db.query(Album).filter(Album.id == room.shadow_album_id).delete()

    db.query(RoomMember).filter(RoomMember.room_id == room_id).delete()
    db.delete(room)
    db.commit()
    return {"success": True, "message": "Room deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# QR
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{room_id}/qr")
def get_qr_payload(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Creator only: return the QR payload JSON to re-display the room QR code."""
    room = _get_active_room(db, room_id)
    _require_creator(db, room_id, user_id)
    return {
        "qr_payload": json.dumps({"room_id": room.id, "room_name": room.name, "room_key": room.id}),
        "room_id": room.id,
        "room_name": room.name,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Join Flow
# ─────────────────────────────────────────────────────────────────────────────

class JoinRequest(BaseModel):
    requested_role: str = "viewer"  # "viewer" or "uploader" (ignored for shared rooms)


@router.post("/{room_id}/request-join")
def request_join(
    room_id: str,
    payload: JoinRequest = JoinRequest(),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    User requests to join a room (after scanning QR).
    Creates a RoomMember with status=pending.
    Idempotent: already pending/approved → return current status.
    """
    room = _get_active_room(db, room_id)

    # Validate requested role based on room type
    if room.room_type == "shared":
        requested_role = "attendee"
    else:
        allowed_roles = {"viewer", "uploader"}
        requested_role = payload.requested_role if payload.requested_role in allowed_roles else "viewer"

    # Check if already a member
    existing = _get_member(db, room_id, user_id)
    if existing:
        if existing.status == "approved":
            return {"status": "approved", "message": "Already a member"}
        if existing.status == "pending":
            return {"status": "pending", "message": "Request already pending"}
        if existing.status == "rejected":
            # Allow re-request after rejection
            existing.status = "pending"
            existing.role = requested_role
            db.commit()
            return {"status": "pending", "message": "Re-request submitted"}

    # Check capacity
    if _approved_count(db, room_id) >= room.max_members:
        raise HTTPException(status_code=400, detail="Room is full")

    user = db.get(User, user_id)
    
    # Auto-approve event viewers
    initial_status = "pending"
    if room.room_type == "event" and requested_role == "viewer":
        initial_status = "approved"

    member = RoomMember(
        room_id=room_id,
        user_id=user_id,
        role=requested_role,
        status=initial_status,
        display_name=user.username if user else "",
    )
    db.add(member)
    db.commit()
    
    if initial_status == "approved":
        return {"status": "approved", "message": "Joined room automatically"}

    # Notify Creator for pending requests
    creator = db.query(User).filter(User.id == room.created_by).first()
    role_label = "uploader access" if requested_role == "uploader" else "to join"
    if creator and creator.push_token:
        send_push_notification(
            push_token=creator.push_token,
            title="New Join Request",
            body=f"{user.username if user else 'Someone'} wants {role_label} in {room.name}!",
            data={"room_id": room.id}
        )

    return {"status": "pending", "message": "Join request sent — waiting for creator approval"}


class ChangeRoleRequest(BaseModel):
    role: str  # "viewer" or "uploader"


@router.post("/{room_id}/members/{target_user_id}/set-role")
def set_member_role(
    room_id: str,
    target_user_id: str,
    payload: ChangeRoleRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Creator only: change the role of an approved member."""
    room = _get_active_room(db, room_id)
    _require_creator(db, room_id, user_id)

    if room.room_type == "shared":
        raise HTTPException(status_code=400, detail="Cannot change roles in a shared room")

    allowed_roles = {"viewer", "uploader"}
    if payload.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {allowed_roles}")

    # Debug: log what we're looking for
    all_members = db.query(RoomMember).filter(RoomMember.room_id == room_id).all()
    import logging
    logger = logging.getLogger(__name__)
    logger.warning(f"[set-role] Looking for user_id={target_user_id!r} in room={room_id!r}")
    logger.warning(f"[set-role] Members in room: {[(m.user_id, m.role, m.status) for m in all_members]}")

    member = _get_member(db, room_id, target_user_id)
    if not member:
        raise HTTPException(status_code=404, detail=f"Member not found (user_id={target_user_id!r})")
    if member.role == "creator":
        raise HTTPException(status_code=400, detail="Cannot change the creator's role")
    if member.status != "approved":
        raise HTTPException(status_code=400, detail="Member is not yet approved")

    old_role = member.role
    member.role = payload.role
    db.commit()

    return {"success": True, "user_id": target_user_id, "old_role": old_role, "new_role": payload.role}



@router.get("/{room_id}/requests", response_model=List[MemberSummary])
def list_pending_requests(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Creator only: list all pending join requests."""
    _get_active_room(db, room_id)
    _require_creator(db, room_id, user_id)

    pending = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room_id, RoomMember.status == "pending")
        .all()
    )
    return [
        MemberSummary(
            user_id=m.user_id,
            display_name=m.display_name,
            role=m.role,
            status=m.status,
            joined_at=m.joined_at,
        )
        for m in pending
    ]


@router.post("/{room_id}/members/{target_user_id}/approve")
def approve_member(
    room_id: str,
    target_user_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Creator only: approve a pending join request."""
    _get_active_room(db, room_id)
    _require_creator(db, room_id, user_id)

    member = _get_member(db, room_id, target_user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Join request not found")
    if member.status == "approved":
        return {"message": "Already approved"}

    # Check capacity before approving
    room = db.get(Room, room_id)
    if _approved_count(db, room_id) >= room.max_members:
        raise HTTPException(status_code=400, detail="Room is full")

    member.status = "approved"
    db.commit()
    
    # Notify approved member
    approved_user = db.query(User).filter(User.id == target_user_id).first()
    if approved_user and approved_user.push_token:
        send_push_notification(
            push_token=approved_user.push_token,
            title="Request Approved",
            body=f"You are now a member of {room.name}!",
            data={"room_id": room.id}
        )

    return {"success": True, "message": f"{member.display_name} approved"}


@router.post("/{room_id}/members/{target_user_id}/reject")
def reject_member(
    room_id: str,
    target_user_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Creator only: reject a pending join request."""
    _get_active_room(db, room_id)
    _require_creator(db, room_id, user_id)

    member = _get_member(db, room_id, target_user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Join request not found")

    member.status = "rejected"
    db.commit()
    return {"success": True, "message": "Request rejected"}


@router.delete("/{room_id}/leave")
def leave_room(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Member leaves the room. Creator cannot leave — must delete room."""
    _get_active_room(db, room_id)
    member = _get_member(db, room_id, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Not a member of this room")
    if member.role == "creator":
        raise HTTPException(
            status_code=400,
            detail="Creator cannot leave. Delete the room or transfer ownership."
        )
    db.delete(member)
    db.commit()
    return {"success": True, "message": "Left the room"}

@router.delete("/{room_id}/members/{target_user_id}")
def remove_member(
    room_id: str,
    target_user_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Creator only: remove a member and delete all their photos from this room."""
    from app.models.photo import Photo
    from app.models.face_detection import FaceDetection
    from app.models.cluster import Cluster
    from app.services.storage.storage_backend import get_store_for_path

    room = _get_active_room(db, room_id)
    _require_creator(db, room_id, user_id)

    member = _get_member(db, room_id, target_user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == "creator":
        raise HTTPException(status_code=400, detail="Cannot remove the creator")

    # 1. Delete member
    db.delete(member)

    # 2. Find their uploaded photos in this room
    user_photos = db.query(Photo).filter(Photo.room_id == room_id, Photo.uploader_id == target_user_id).all()
    
    if user_photos:
        affected_cluster_labels = set()
        
        for p in user_photos:
            # Delete blob
            try:
                store = get_store_for_path(p.encrypted_blob_url)
                store.delete_encrypted_blob(p.encrypted_blob_url)
            except Exception as e:
                print(f"Warning: Failed to delete blob: {e}")
            
            # Get face detections for cluster updating
            fds = db.query(FaceDetection).filter(FaceDetection.photo_id == p.id).all()
            for fd in fds:
                if fd.cluster_label != -1:
                    affected_cluster_labels.add(fd.cluster_label)
            
            # Delete face detections
            db.query(FaceDetection).filter(FaceDetection.photo_id == p.id).delete()
            # Delete photo record
            db.delete(p)

        # Update cluster counts
        for label in affected_cluster_labels:
            cluster = db.query(Cluster).filter(
                Cluster.album_id == room.shadow_album_id, 
                Cluster.cluster_label == label
            ).first()
            if cluster:
                count = db.query(FaceDetection).filter(
                    FaceDetection.album_id == room.shadow_album_id, 
                    FaceDetection.cluster_label == label
                ).count()
                if count == 0:
                    db.delete(cluster)
                else:
                    cluster.face_count = count

    db.commit()
    return {"success": True, "message": "Member and their photos removed"}


@router.get("/{room_id}/members", response_model=List[MemberSummary])
def list_members(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all approved members of the room."""
    _get_active_room(db, room_id)
    _require_approved_member(db, room_id, user_id)

    members = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room_id, RoomMember.status == "approved")
        .all()
    )
    return [
        MemberSummary(
            user_id=m.user_id,
            display_name=m.display_name,
            role=m.role,
            status=m.status,
            joined_at=m.joined_at,
        )
        for m in members
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Photos
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{room_id}/photos/upload")
def upload_room_photos(
    room_id: str,
    files: List[UploadFile] = File(...),
    embeddings_json: str = Form("[]"),
    face_counts_json: str = Form("[]"),
    bboxes_json: str = Form("[]"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Upload photos into a room (approved members only).
    Identical interface to the album upload endpoint.
    For event rooms, only the creator can upload.
    """
    room = _get_active_room(db, room_id)
    member = _require_approved_member(db, room_id, user_id)

    # Event room: only creator and explicit uploaders can upload
    if room.room_type == "event" and member.role not in ("creator", "uploader"):
        raise HTTPException(
            status_code=403,
            detail="Only the room creator or approved uploaders can upload photos in an Event room"
        )

    if not room.shadow_album_id:
        raise HTTPException(status_code=500, detail="Room has no shadow album — contact support")

    embeddings = json.loads(embeddings_json)
    face_counts = json.loads(face_counts_json)
    bboxes = json.loads(bboxes_json) if bboxes_json else []

    store = get_write_store()
    uploaded = []

    for i, file in enumerate(files):
        blob = file.file.read()
        photo_id = str(uuid.uuid4())

        # Save to R2 (or local fallback)
        blob_key = store.save_encrypted_blob(room.shadow_album_id, photo_id, blob)

        face_count = face_counts[i] if i < len(face_counts) else 0
        photo = Photo(
            id=photo_id,
            album_id=room.shadow_album_id,
            room_id=room_id,
            uploader_id=user_id,
            encrypted_blob_url=blob_key,
            face_count=face_count,
            original_filename=file.filename or "",
        )
        db.add(photo)
        db.flush()

        # Store face embeddings if provided
        photo_embeddings = embeddings[i] if i < len(embeddings) else []
        photo_bboxes = bboxes[i] if i < len(bboxes) else []
        for j, emb in enumerate(photo_embeddings):
            bbox_val = ",".join(str(v) for v in photo_bboxes[j]) if j < len(photo_bboxes) else None
            face = FaceDetection(
                photo_id=photo.id,
                album_id=room.shadow_album_id,
                face_index=j,
                bbox=bbox_val,
                embedding_json=json.dumps(emb) if isinstance(emb, list) else emb,
                embedding_vec=emb if isinstance(emb, list) else json.loads(emb)
            )
            db.add(face)

        uploaded.append({"photo_id": photo.id, "blob_key": blob_key})

    # Update album photo count
    album = db.get(Album, room.shadow_album_id)
    if album:
        album.total_photos += len(files)

    db.commit()

    # ── Auto-dispatch clustering job ──────────────────────────────
    # Only dispatch if the album is not already clustering (race guard).
    # We use an atomic UPDATE to prevent race conditions when two users
    # upload at the exact same time.
    uploaded_photo_ids = [p["photo_id"] for p in uploaded]
    job_id = None
    if album:
        from sqlalchemy import update
        
        stmt = (
            update(Album)
            .where(Album.id == room.shadow_album_id, Album.status != "clustering")
            .values(status="clustering")
        )
        result = db.execute(stmt)
        db.commit()

        if result.rowcount > 0:
            from app.models.job import PipelineJob
            new_job = PipelineJob(
                album_id=room.shadow_album_id,
                room_id=room_id,
                uploader_id=user_id,
                photo_ids_json=json.dumps(uploaded_photo_ids),
                status="queued",
                stage="queued",
            )
            db.add(new_job)
            db.commit()
            job_id = new_job.id
            try:
                from app.workers.queue import get_queue
                rq_job = get_queue().enqueue(
                    "app.workers.tasks.process_room_upload_job",
                    new_job.id,
                    room_id,
                    room.shadow_album_id,
                    uploaded_photo_ids,
                    user_id,
                )
                new_job.rq_job_id = rq_job.id
                db.commit()
            except Exception:
                # Dev mode (no Redis): run synchronously
                from app.workers.tasks import process_room_upload_job
                process_room_upload_job(
                    new_job.id, room_id, room.shadow_album_id,
                    uploaded_photo_ids, user_id,
                )

    # Notify all other approved members in the room
    if uploaded:
        members = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.status == "approved", RoomMember.user_id != user_id).all()
        uploader = db.query(User).filter(User.id == user_id).first()
        for m in members:
            u = db.query(User).filter(User.id == m.user_id).first()
            if u and u.push_token:
                send_push_notification(
                    push_token=u.push_token,
                    title="New Photos Added",
                    body=f"{uploader.username if uploader else 'Someone'} added {len(uploaded)} photos to {room.name}",
                    data={"room_id": room.id}
                )

    return {"uploaded": len(uploaded), "photos": uploaded, "job_id": job_id}


@router.get("/{room_id}/photos", response_model=List[PhotoSummary])
def list_room_photos(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all photos in the room (approved members only)."""
    room = _get_active_room(db, room_id)
    member = _require_approved_member(db, room_id, user_id)

    if not room.shadow_album_id:
        return []

    query = db.query(Photo).filter(Photo.album_id == room.shadow_album_id)

    if room.room_type == "event":
        if member.role == "viewer":
            return []  # Viewer sees nothing in the main feed
        elif member.role == "uploader":
            query = query.filter(Photo.uploader_id == user_id)  # Uploader sees only their own

    photos = query.all()

    # Build uploader name lookup
    uploader_ids = {p.uploader_id for p in photos}
    users = {u.id: u.username for u in db.query(User).filter(User.id.in_(uploader_ids)).all()}

    return [
        PhotoSummary(
            id=p.id,
            encrypted_blob_url=p.encrypted_blob_url,
            face_count=p.face_count,
            original_filename=p.original_filename,
            uploader_id=p.uploader_id,
            uploader_name=users.get(p.uploader_id, "Unknown"),
            created_at=p.created_at,
        )
        for p in photos
    ]


@router.get("/{room_id}/photos/{photo_id}/raw")
def get_room_photo_raw(
    room_id: str,
    photo_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Stream raw photo blob (approved members only)."""
    import os
    from app.services.storage.storage_backend import get_store_for_path
    from app.services.storage.r2_store import R2Store
    from fastapi.responses import StreamingResponse, FileResponse

    room = _get_active_room(db, room_id)
    _require_approved_member(db, room_id, user_id)

    photo = db.query(Photo).filter(
        Photo.id == photo_id, Photo.room_id == room_id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    if not photo.encrypted_blob_url:
        raise HTTPException(status_code=404, detail="Photo file not found")

    try:
        store = get_store_for_path(photo.encrypted_blob_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if isinstance(store, R2Store):
        try:
            body, length = store.stream_encrypted_blob(photo.encrypted_blob_url)
        except Exception as exc:
            raise HTTPException(status_code=404, detail=f"Photo not available: {exc}")
        return StreamingResponse(
            body.iter_chunks(chunk_size=65536),
            media_type="image/jpeg",
            headers={"Content-Length": str(length)} if length else {},
        )
    else:
        try:
            data = store.read_encrypted_blob(photo.encrypted_blob_url)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Photo file not found on server")
        from fastapi.responses import Response
        return Response(content=data, media_type="image/jpeg")


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{room_id}/process")
def trigger_room_processing(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Any approved member can manually re-trigger clustering on the room.

    Auto-dispatch already fires on every upload. Use this endpoint to
    re-run clustering after ejecting faces or editing clusters.
    """
    room = _get_active_room(db, room_id)
    _require_approved_member(db, room_id, user_id)

    if not room.shadow_album_id:
        raise HTTPException(status_code=400, detail="Room has no photos yet")

    album = db.get(Album, room.shadow_album_id)
    if not album:
        raise HTTPException(status_code=500, detail="Shadow album missing")

    if album.status == "clustering":
        return {"message": "Already processing", "status": album.status}

    from app.models.job import PipelineJob
    new_job = PipelineJob(
        album_id=room.shadow_album_id,
        room_id=room_id,
        uploader_id=user_id,
        status="queued",
        stage="queued",
    )
    db.add(new_job)
    album.status = "clustering"
    db.commit()

    try:
        from app.workers.queue import get_queue
        rq_job = get_queue().enqueue(
            "app.workers.tasks.process_room_upload_job",
            new_job.id,
            room_id,
            room.shadow_album_id,
            [],
            user_id,
        )
        new_job.rq_job_id = rq_job.id
        db.commit()
    except Exception:
        # Dev mode (no Redis): run synchronously
        from app.workers.tasks import process_room_upload_job
        process_room_upload_job(
            new_job.id, room_id, room.shadow_album_id, [], user_id
        )

    return {"message": "Processing started", "job_id": new_job.id, "album_id": room.shadow_album_id}


@router.get("/{room_id}/status")
def get_room_status(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get the current pipeline status for the room.

    Returns album status, counts, and the 10 most recent processing jobs
    so the client knows which members' uploads have been processed.
    """
    room = _get_active_room(db, room_id)
    member = _require_approved_member(db, room_id, user_id)

    if not room.shadow_album_id:
        return {
            "room_id": room.id,
            "name": room.name,
            "room_type": room.room_type,
            "my_role": member.role,
            "my_status": member.status,
            "status": "empty",
            "photo_count": 0, 
            "cluster_count": 0, 
            "jobs": []
        }

    from app.models.job import PipelineJob
    album = db.get(Album, room.shadow_album_id)
    
    # Calculate filtered cluster count
    clusters = db.query(Cluster).filter(Cluster.album_id == room.shadow_album_id).all()
    filtered_cluster_count = 0
    for c in clusters:
        unique_photos = (
            db.query(FaceDetection.photo_id)
            .filter(FaceDetection.album_id == room.shadow_album_id, FaceDetection.cluster_label == c.cluster_label)
            .distinct()
            .count()
        )
        if unique_photos >= 2:
            filtered_cluster_count += 1
            
    cluster_count = filtered_cluster_count
    photo_count = db.query(Photo).filter(Photo.album_id == room.shadow_album_id).count()

    # Recent jobs for this room (latest 10)
    recent_jobs = (
        db.query(PipelineJob)
        .filter(PipelineJob.room_id == room_id)
        .order_by(PipelineJob.created_at.desc())
        .limit(10)
        .all()
    )
    jobs_out = [
        {
            "job_id": j.id,
            "uploader_id": j.uploader_id,
            "status": j.status,
            "stage": j.stage,
            "created_at": j.created_at.isoformat() if j.created_at else None,
        }
        for j in recent_jobs
    ]

    return {
        "room_id": room.id,
        "name": room.name,
        "room_type": room.room_type,
        "my_role": member.role,
        "my_status": member.status,
        "status": album.status if album else "unknown",
        "photo_count": photo_count,
        "cluster_count": cluster_count,
        "album_id": room.shadow_album_id,
        "jobs": jobs_out,
    }


@router.get("/{room_id}/clusters", response_model=List[ClusterSummary])
def get_room_clusters(
    room_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get all face clusters for the room (approved members only)."""
    room = _get_active_room(db, room_id)
    _require_approved_member(db, room_id, user_id)

    if not room.shadow_album_id:
        return []

    clusters = (
        db.query(Cluster)
        .filter(Cluster.album_id == room.shadow_album_id)
        .order_by(Cluster.face_count.desc())
        .all()
    )

    cluster_summaries = []
    for c in clusters:
        # Count unique photos for this cluster
        unique_photos_count = (
            db.query(FaceDetection.photo_id)
            .filter(FaceDetection.album_id == room.shadow_album_id, FaceDetection.cluster_label == c.cluster_label)
            .distinct()
            .count()
        )

        # Hide noise: only return clusters that span 2 or more distinct photos.
        if unique_photos_count < 2:
            continue

        rep_face = db.query(FaceDetection).filter(
            FaceDetection.album_id == room.shadow_album_id,
            FaceDetection.cluster_label == c.cluster_label
        ).first()

        rep_face_dict = None
        if rep_face and rep_face.bbox:
            try:
                bbox_list = [float(x) for x in rep_face.bbox.split(",")]
                rep_face_dict = {
                    "photo_id": rep_face.photo_id,
                    "bbox": bbox_list
                }
            except Exception:
                pass

        cluster_summaries.append(
            ClusterSummary(
                id=c.id,
                cluster_label=c.cluster_label,
                display_name=c.display_name or f"Person {c.cluster_label + 1}",
                face_count=c.face_count,
                representative_face=rep_face_dict,
            )
        )
    return cluster_summaries


# ─────────────────────────────────────────────────────────────────────────────
# Event Mode (Phase 6) - Find Me
# ─────────────────────────────────────────────────────────────────────────────

class FindMeRequest(BaseModel):
    embedding: List[float]

class FindMeMatch(BaseModel):
    photo_id: str
    similarity: float
    encrypted_blob_url: str

@router.post("/{room_id}/find-me", response_model=List[FindMeMatch])
def find_me_in_room(
    room_id: str,
    payload: FindMeRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Submit a selfie embedding to find all matching photos in a room.

    Strategy (centroid-based, O(K) not O(N)):
      1. Load all Cluster centroids for the room's shadow album  (K clusters).
      2. Compute cosine similarity between the query and each centroid in-memory.
         (Embeddings are L2-normalised, so dot-product == cosine similarity.)
      3. Collect every cluster whose centroid similarity >= CENTROID_THRESHOLD.
      4. Fetch all photos that contain a face detection in any matched cluster.
      5. Return de-duplicated results ordered by best centroid similarity.

    Fallback: clusters without a stored centroid are matched by computing
    similarity on-the-fly from their member face_detections (covers old data).
    """
    import json as _json
    import numpy as np
    from app.models.cluster import Cluster
    from app.models.face_detection import FaceDetection
    from app.models.photo import Photo

    CENTROID_THRESHOLD = 0.60   # minimum cosine similarity to a cluster centroid
    FACE_FALLBACK_THRESHOLD = 0.60  # used when centroid_json is absent

    room = _get_active_room(db, room_id)
    _require_approved_member(db, room_id, user_id)

    if not room.shadow_album_id:
        return []

    album_id = room.shadow_album_id

    # ── Step 1: Normalise the query embedding ────────────────────────────────
    query = np.array(payload.embedding, dtype=np.float32)
    q_norm = np.linalg.norm(query)
    if q_norm > 1e-10:
        query = query / q_norm

    # ── Step 2: Load clusters and score against centroids ────────────────────
    clusters = (
        db.query(Cluster)
        .filter(Cluster.album_id == album_id)
        .all()
    )

    if not clusters:
        return []

    matched_labels: dict[int, float] = {}   # cluster_label -> best similarity

    clusters_without_centroid: list[Cluster] = []

    for c in clusters:
        if c.centroid_json:
            try:
                centroid = np.array(_json.loads(c.centroid_json), dtype=np.float32)
                c_norm = np.linalg.norm(centroid)
                if c_norm > 1e-10:
                    centroid = centroid / c_norm
                sim = float(np.dot(query, centroid))
                if sim >= CENTROID_THRESHOLD:
                    matched_labels[c.cluster_label] = sim
            except Exception:
                clusters_without_centroid.append(c)
        else:
            clusters_without_centroid.append(c)

    # ── Step 3: Fallback — score clusters that lack a stored centroid ─────────
    if clusters_without_centroid:
        fallback_labels = {c.cluster_label for c in clusters_without_centroid}
        fallback_faces = (
            db.query(FaceDetection)
            .filter(
                FaceDetection.album_id == album_id,
                FaceDetection.cluster_label.in_(list(fallback_labels)),
                FaceDetection.det_score >= 0.6,
            )
            .all()
        )
        label_sims: dict[int, list[float]] = {}
        for fd in fallback_faces:
            if not fd.embedding_json:
                continue
            try:
                emb = np.array(_json.loads(fd.embedding_json), dtype=np.float32)
                e_norm = np.linalg.norm(emb)
                if e_norm > 1e-10:
                    emb = emb / e_norm
                sim = float(np.dot(query, emb))
                label_sims.setdefault(fd.cluster_label, []).append(sim)
            except Exception:
                continue
        for lbl, sims in label_sims.items():
            avg_sim = float(np.mean(sims))
            if avg_sim >= FACE_FALLBACK_THRESHOLD:
                matched_labels[lbl] = max(matched_labels.get(lbl, 0.0), avg_sim)

    if not matched_labels:
        return []

    # ── Step 4: Fetch all photos belonging to matched clusters ────────────────
    matched_cluster_labels = list(matched_labels.keys())

    rows = (
        db.query(FaceDetection.photo_id, FaceDetection.cluster_label, Photo.encrypted_blob_url)
        .join(Photo, Photo.id == FaceDetection.photo_id)
        .filter(
            FaceDetection.album_id == album_id,
            FaceDetection.cluster_label.in_(matched_cluster_labels),
            FaceDetection.det_score >= 0.6,
        )
        .all()
    )

    # ── Step 5: De-duplicate by photo_id, keep best cluster similarity ────────
    seen: dict[str, FindMeMatch] = {}
    for photo_id, cluster_label, encrypted_blob_url in rows:
        sim = matched_labels.get(cluster_label, 0.0)
        if photo_id not in seen or sim > seen[photo_id].similarity:
            seen[photo_id] = FindMeMatch(
                photo_id=photo_id,
                similarity=sim,
                encrypted_blob_url=encrypted_blob_url or "",
            )

    results = sorted(seen.values(), key=lambda m: m.similarity, reverse=True)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Deletion Endpoints (Granular)
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/{room_id}/photos/{photo_id}")
def delete_room_photo(
    room_id: str,
    photo_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Delete a specific photo from a room.
    Can be done by the room creator or the uploader of the photo.
    """
    from fastapi import HTTPException
    from app.models.photo import Photo
    from app.models.face_detection import FaceDetection
    from app.models.cluster import Cluster
    from app.services.storage.storage_backend import get_store_for_path

    room = _get_active_room(db, room_id)
    member = _require_approved_member(db, room_id, user_id)

    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo or photo.album_id != room.shadow_album_id:
        raise HTTPException(status_code=404, detail="Photo not found in this room.")

    # Check permission: creator or uploader
    if member.role != "creator" and photo.uploader_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this photo.")

    # 1. Delete blob
    try:
        store = get_store_for_path(photo.encrypted_blob_url)
        store.delete_encrypted_blob(photo.encrypted_blob_url)
    except Exception as e:
        print(f"Warning: Failed to delete blob: {e}")

    # 2. Get cluster labels for this photo before deleting faces to update cluster face counts
    face_detections = db.query(FaceDetection).filter(FaceDetection.photo_id == photo_id).all()
    affected_cluster_labels = [fd.cluster_label for fd in face_detections if fd.cluster_label != -1]

    # 3. Delete DB rows
    db.query(FaceDetection).filter(FaceDetection.photo_id == photo_id).delete()
    db.delete(photo)

    # 4. Update cluster face counts
    for label in set(affected_cluster_labels):
        cluster = db.query(Cluster).filter(
            Cluster.album_id == room.shadow_album_id, 
            Cluster.cluster_label == label
        ).first()
        if cluster:
            count = db.query(FaceDetection).filter(
                FaceDetection.album_id == room.shadow_album_id, 
                FaceDetection.cluster_label == label
            ).count()
            if count == 0:
                db.delete(cluster)
            else:
                cluster.face_count = count

    db.commit()
    return {"success": True, "message": "Photo deleted"}


@router.delete("/{room_id}/clusters/{cluster_label}")
def delete_room_cluster(
    room_id: str,
    cluster_label: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Dissolve a cluster in a room. Does not delete photos.
    Creator only.
    """
    from fastapi import HTTPException
    from app.models.cluster import Cluster
    from app.models.face_detection import FaceDetection

    room = _get_active_room(db, room_id)
    _require_creator(db, room_id, user_id)

    if not room.shadow_album_id:
        raise HTTPException(status_code=404, detail="Room has no album.")

    cluster = db.query(Cluster).filter(
        Cluster.album_id == room.shadow_album_id,
        Cluster.cluster_label == cluster_label
    ).first()

    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found.")

    # 1. Set faces to un-clustered (-1)
    db.query(FaceDetection).filter(
        FaceDetection.album_id == room.shadow_album_id,
        FaceDetection.cluster_label == cluster_label
    ).update({"cluster_label": -1})

    # 2. Delete the cluster row
    db.delete(cluster)
    db.commit()

    return {"success": True, "message": "Cluster deleted"}
