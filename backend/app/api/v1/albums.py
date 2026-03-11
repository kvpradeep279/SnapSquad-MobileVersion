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

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
from app.services.storage.local_store import LocalStore
from app.workers.queue import get_queue

router = APIRouter()


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
    metadata: str,                              # JSON string of PhotoUploadRequest
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

    # Store the encrypted blob
    store = LocalStore()
    blob_data = encrypted_blob.file.read()
    blob_path = store.save_encrypted_blob(album_id, upload_req.photo_id, blob_data)

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

    This is called after all photos have been uploaded. It:
        1. Creates a PipelineJob record (status: queued)
        2. Enqueues the clustering task on the RQ job queue
        3. Returns immediately — mobile app polls /status until complete

    The clustering worker (app/workers/tasks.py) will:
        - Load all protected embeddings from the face_detections table
        - Run the 10-stage HDBSCAN pipeline (cluster_faces_v21)
        - Update face_detections with cluster labels
        - Create Cluster records
        - Update album status to "complete"
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

    # Enqueue clustering task
    rq_job = get_queue().enqueue(
        "app.workers.tasks.process_album_job",
        job.id,
        album_id,
    )
    job.rq_job_id = rq_job.id
    db.commit()

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
