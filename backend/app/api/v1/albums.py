"""
Album endpoints — create albums, upload photos, trigger clustering, check status.

FLOW (V1):
    1. POST   /albums              -> Create empty album
    2. POST   /albums/{id}/photos  -> Upload encrypted photo + protected embeddings (repeat per photo)
    3. POST   /albums/{id}/process -> Trigger HDBSCAN clustering (async via RQ)
    4. GET    /albums/{id}/status  -> Poll until clustering completes

ARCHITECTURE:
    The mobile app has already:
        - Detected faces with SCRFD (on device)
        - Extracted embeddings with MobileFaceNet (on device)
        - Applied feature subtraction for privacy (on device)
        - Encrypted the photo with AES-256 (on device)

    This server receives ONLY:
        - Encrypted photo blobs (cannot read them)
        - Protected embeddings (cannot invert them)
    And runs ONLY:
        - HDBSCAN clustering (pure math, zero ML models)
"""

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.album import Album
from app.models.face_detection import FaceDetection
from app.models.job import PipelineJob
from app.models.photo import Photo
from app.schemas.album import AlbumCreateRequest, AlbumCreateResponse, AlbumStatusResponse
from app.schemas.job import ProcessAlbumResponse
from app.schemas.photo import PhotoUploadRequest, PhotoUploadResponse
from app.services.storage.storage_backend import get_write_store, get_store_for_path
from app.workers.queue import get_queue

router = APIRouter()


# ── List Albums ──────────────────────────────────────────────────

@router.get("")
def list_albums(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all albums belonging to the current user.

    Used by the Home screen to display recent albums with status pills.
    """
    albums = (
        db.query(Album)
        .filter(Album.user_id == user_id)
        .order_by(Album.created_at.desc())
        .all()
    )
    
    result = []
    for a in albums:
        first_photo = db.query(Photo).filter(Photo.album_id == a.id).order_by(Photo.created_at.asc()).first()
        result.append({
            "album_id": a.id,
            "name": a.name,
            "status": a.status,
            "total_photos": a.total_photos,
            "total_faces": a.total_faces,
            "created_at": str(a.created_at),
            "thumbnail_photo_id": first_photo.id if first_photo else None,
        })
    return result


# ── Create Album ─────────────────────────────────────────────────

@router.post("", response_model=AlbumCreateResponse)
def create_album(
    payload: AlbumCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Create a new empty album for uploading photos.

    The mobile app calls this first, gets back an album_id,
    then uploads photos to that album one by one.
    """
    album = Album(user_id=user_id, name=payload.name, status="created")
    db.add(album)
    db.commit()
    db.refresh(album)
    return AlbumCreateResponse(album_id=album.id, status=album.status)


# ── Upload Photo + Embeddings ────────────────────────────────────

@router.post("/{album_id}/photos", response_model=PhotoUploadResponse)
def upload_photo(
    album_id: str,
    metadata: str = Form(...),                  # Metadata JSON as a form field
    encrypted_blob: UploadFile = File(...),      # The AES-256 encrypted photo
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Upload a single encrypted photo with its face detections.

    The mobile app sends:
        - metadata: JSON string containing photo_id, original_filename,
          and a list of face detections with protected embeddings
        - encrypted_blob: The AES-256 encrypted photo file

    The server stores:
        - Encrypted blob in local storage (or Cloudinary in production)
        - Protected embeddings in the face_detections table
        - Photo metadata in the photos table
    """
    # Validate album exists and belongs to this user
    album = db.get(Album, album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your album")

    # Parse the metadata JSON
    try:
        upload_req = PhotoUploadRequest.model_validate_json(metadata)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid metadata JSON")

    # Store the encrypted blob (R2 if configured, local filesystem as fallback)
    store = get_write_store()
    blob_data = encrypted_blob.file.read()
    try:
        blob_path = store.save_encrypted_blob(album_id, upload_req.photo_id, blob_data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Storage error: {exc}")

    # Create Photo record
    photo = Photo(
        id=upload_req.photo_id,
        album_id=album_id,
        uploader_id=user_id,
        encrypted_blob_url=blob_path,
        face_count=len(upload_req.faces),
        original_filename=upload_req.original_filename,
    )
    db.add(photo)
    db.flush()  # Ensure photo is inserted before face_detections reference its ID

    # Store each face detection with its protected embedding
    for face in upload_req.faces:
        fd = FaceDetection(
            photo_id=upload_req.photo_id,
            album_id=album_id,
            face_index=face.face_index,
            bbox=",".join(str(v) for v in face.bbox),
            det_score=face.det_score,
            embedding_json=json.dumps(face.embedding),
        )
        db.add(fd)

    # Update album counters
    album.total_photos += 1
    album.total_faces += len(upload_req.faces)
    album.status = "uploading"

    db.commit()

    return PhotoUploadResponse(
        photo_id=upload_req.photo_id,
        faces_stored=len(upload_req.faces),
        status="stored",
    )


# ── Trigger Clustering ───────────────────────────────────────────

@router.post("/{album_id}/process", response_model=ProcessAlbumResponse)
def process_album(
    album_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Trigger HDBSCAN clustering on all face embeddings in this album.

    DEV MODE: Runs clustering synchronously (no Redis needed).
    PROD MODE: Enqueues on RQ job queue when REDIS_URL is configured.
    """
    album = db.get(Album, album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your album")

    # Check we have faces to cluster
    face_count = (
        db.query(FaceDetection)
        .filter(FaceDetection.album_id == album_id)
        .count()
    )
    if face_count == 0:
        raise HTTPException(status_code=400, detail="No faces uploaded yet")

    # Create job record
    job = PipelineJob(album_id=album_id, status="queued", stage="queued")
    db.add(job)
    album.status = "clustering"
    db.commit()
    db.refresh(job)

    try:
        from app.workers.queue import get_queue
        rq_job = get_queue().enqueue(
            "app.workers.tasks.process_album_job",
            job.id,
            album_id,
        )
        job.rq_job_id = rq_job.id
        db.commit()
    except Exception as e:
        # DEV MODE: Redis not available — run synchronously
        try:
            from app.workers.tasks import process_album_job
            process_album_job(job.id, album_id)
        except Exception as job_exc:
            # If even the synchronous call fails, mark them as failed
            job.status = "failed"
            job.stage = f"Error: {str(job_exc)}"
            album.status = "failed"
            db.commit()
            print(f"Error running job synchronously: {job_exc}")

    return ProcessAlbumResponse(album_id=album_id, job_id=job.id, status=job.status)


# ── Check Status ─────────────────────────────────────────────────

@router.get("/{album_id}/status", response_model=AlbumStatusResponse)
def album_status(
    album_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Check the processing status of an album.

    The mobile app polls this after calling /process.
    Returns current status and the latest pipeline stage.
    """
    album = db.get(Album, album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your album")

    latest_job = (
        db.query(PipelineJob)
        .filter(PipelineJob.album_id == album_id)
        .order_by(PipelineJob.created_at.desc())
        .first()
    )

    return AlbumStatusResponse(
        album_id=album_id,
        status=album.status,
        stage=latest_job.stage if latest_job else "none",
        total_photos=album.total_photos,
        total_faces=album.total_faces,
    )


# ── Debug Clustering Stats (DEV ONLY) ────────────────────────────

@router.get("/{album_id}/debug")
def debug_album_clustering(
    album_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """DEV ONLY: Dump clustering stats and embedding similarity matrix.

    Use this after running /process to understand why clustering fails.
    Returns per-face cluster assignments and embedding pairwise similarities.
    """
    import json
    import numpy as np
    from app.models.face_detection import FaceDetection

    album = db.get(Album, album_id)
    if not album or album.user_id != user_id:
        raise HTTPException(status_code=404, detail="Album not found")

    face_dets = (
        db.query(FaceDetection)
        .filter(FaceDetection.album_id == album_id)
        .order_by(FaceDetection.created_at.asc())
        .all()
    )

    if not face_dets:
        return {"error": "No faces in this album"}

    # Build embedding matrix
    embeddings = np.array([json.loads(fd.embedding_json) for fd in face_dets], dtype=np.float32)
    n = len(embeddings)

    # Compute pairwise cosine similarities
    cos_sim = (embeddings @ embeddings.T).tolist()

    # Per-face info
    faces_info = [
        {
            "photo_id": fd.photo_id,
            "face_index": fd.face_index,
            "cluster_label": fd.cluster_label,
            "det_score": fd.det_score,
            "bbox": fd.bbox,
            "embedding_norm": float(np.linalg.norm(json.loads(fd.embedding_json))),
        }
        for fd in face_dets
    ]

    # Cluster summary
    label_counts: dict[int, int] = {}
    for fd in face_dets:
        lbl = fd.cluster_label if fd.cluster_label is not None else -1
        label_counts[lbl] = label_counts.get(lbl, 0) + 1

    # Sample same-photo similarity (upper bound for same person)
    photo_groups: dict[str, list[int]] = {}
    for i, fd in enumerate(face_dets):
        photo_groups.setdefault(fd.photo_id, []).append(i)

    return {
        "album_id": album_id,
        "total_faces": n,
        "cluster_summary": label_counts,
        "faces": faces_info,
        "pairwise_cosine_sim": cos_sim,  # n×n matrix
        "tip": "Same-person similarities should be > 0.30. If all < 0.20, embeddings are garbage.",
    }


# ── Serve Photo Blob ──────────────────────────────────────────────

from fastapi.responses import FileResponse

@router.get("/{album_id}/photos/{photo_id}/blob")
def get_photo_blob(
    album_id: str,
    photo_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Serve an encrypted photo blob for a user to download and decrypt.

    Restricted only to the uploader of the photo.
    """
    photo = db.scalar(
        select(Photo).where((Photo.id == photo_id) & (Photo.album_id == album_id))
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    if photo.uploader_id != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized access to photo")

    store = LocalStore()
    blob_path = store.get_encrypted_blob_path(album_id, photo_id)
    return FileResponse(blob_path)


# ── Serve Raw Photo (DEV ONLY) ───────────────────────────────────

@router.get("/{album_id}/photos/{photo_id}/raw")
def get_photo_raw(
    album_id: str,
    photo_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """DEV ONLY: Serve a photo as an image (when encryption is skipped).

    When DEV_MODE=true on the mobile app, photos are uploaded unencrypted.
    This endpoint serves them directly as image/jpeg for visual testing.
    Remove or gate behind an env flag before production.
    """
    photo = db.scalar(
        select(Photo).where((Photo.id == photo_id) & (Photo.album_id == album_id))
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    if photo.uploader_id != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized access to photo")

    # Auto-detect which store holds this photo (R2 key vs local path)
    try:
        store = get_store_for_path(photo.encrypted_blob_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Stream from R2 or local — use StreamingResponse for large files
    from app.services.storage.r2_store import R2Store
    if isinstance(store, R2Store):
        from fastapi.responses import StreamingResponse
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
        blob_path = store.get_encrypted_blob_path(album_id, photo_id)
        return FileResponse(blob_path, media_type="image/jpeg")


# ── Photo Deletion & Cluster Ejection ────────────────────────────

from pydantic import BaseModel

class PhotoListRequest(BaseModel):
    photo_ids: list[str]

@router.delete("/{album_id}/photos")
def delete_photos(
    album_id: str,
    req: PhotoListRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Delete a list of photos entirely from the album."""
    album = db.scalar(select(Album).where((Album.id == album_id) & (Album.user_id == user_id)))
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
        
    store = LocalStore()
    
    photos = db.query(Photo).filter(Photo.album_id == album_id, Photo.id.in_(req.photo_ids)).all()
    
    # Delete FaceDetections first to avoid foreign key violation
    db.query(FaceDetection).filter(FaceDetection.album_id == album_id, FaceDetection.photo_id.in_(req.photo_ids)).delete()
    
    for p in photos:
        try:
            # Use the correct store depending on where the photo was originally stored
            photo_store = get_store_for_path(p.encrypted_blob_url)
            photo_store.delete_encrypted_blob(p.encrypted_blob_url)
        except Exception:
            pass  # Don't block deletion if storage cleanup fails
        db.delete(p)
    
    # Check if album is now empty
    remaining_photos = db.query(Photo).filter(Photo.album_id == album_id).count()
    if remaining_photos == 0:
        # Auto-delete the album
        from app.models.cluster import Cluster
        from app.models.edit import ClusterEdit
        from app.models.job import PipelineJob
        
        db.query(Cluster).filter(Cluster.album_id == album_id).delete()
        db.query(ClusterEdit).filter(ClusterEdit.album_id == album_id).delete()
        db.query(PipelineJob).filter(PipelineJob.album_id == album_id).delete()
        db.delete(album)
        db.commit()
        return {"success": True, "deleted_count": len(photos), "album_deleted": True}
        
    db.commit()
    return {"success": True, "deleted_count": len(photos), "album_deleted": False}


class RenameAlbumRequest(BaseModel):
    new_name: str

@router.patch("/{album_id}/rename")
def rename_album(
    album_id: str,
    req: RenameAlbumRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Rename an album."""
    album = db.scalar(select(Album).where((Album.id == album_id) & (Album.user_id == user_id)))
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
        
    album.name = req.new_name
    db.commit()
    return {"success": True, "new_name": album.name}


@router.delete("/{album_id}")
def delete_album(
    album_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Completely delete an album and all its associated data."""
    album = db.scalar(select(Album).where((Album.id == album_id) & (Album.user_id == user_id)))
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
        
    from app.models.cluster import Cluster
    from app.models.edit import ClusterEdit
    from app.models.job import PipelineJob
    
    # Delete photos from storage (R2 or local, auto-detected per photo) and DB
    photos = db.query(Photo).filter(Photo.album_id == album_id).all()
    for photo in photos:
        try:
            photo_store = get_store_for_path(photo.encrypted_blob_url)
            photo_store.delete_encrypted_blob(photo.encrypted_blob_url)
        except Exception:
            pass  # Don't block album deletion if storage cleanup fails
            
    db.query(FaceDetection).filter(FaceDetection.album_id == album_id).delete()
    db.query(Cluster).filter(Cluster.album_id == album_id).delete()
    db.query(ClusterEdit).filter(ClusterEdit.album_id == album_id).delete()
    db.query(PipelineJob).filter(PipelineJob.album_id == album_id).delete()
    db.query(Photo).filter(Photo.album_id == album_id).delete()
    
    db.delete(album)
    db.commit()
    
    return {"success": True, "message": "Album deleted completely"}


@router.post("/{album_id}/clusters/{cluster_label}/eject")
def eject_photos_from_cluster(
    album_id: str,
    cluster_label: int,
    req: PhotoListRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Remove specific photos from this cluster by setting their faces to unidentified (-1)."""
    album = db.scalar(select(Album).where((Album.id == album_id) & (Album.user_id == user_id)))
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
        
    face_dets = db.query(FaceDetection).filter(
        FaceDetection.album_id == album_id,
        FaceDetection.cluster_label == cluster_label,
        FaceDetection.photo_id.in_(req.photo_ids)
    ).all()
    
    for fd in face_dets:
        fd.cluster_label = -1
        
    db.commit()
    return {"success": True, "ejected_faces_count": len(face_dets)}

