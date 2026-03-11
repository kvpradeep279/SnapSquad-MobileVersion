"""
Cluster endpoints — view clusters, rename, merge, eject, and download photos.

FLOW (V1):
    1. GET    /albums/{id}/clusters                         -> List all face clusters
    2. GET    /albums/{id}/clusters/{label}/photos          -> Get encrypted photo URLs for a cluster
    3. PATCH  /albums/{id}/clusters/{label}/rename          -> Rename cluster display name
    4. POST   /albums/{id}/clusters/merge                   -> Merge two clusters
    5. POST   /albums/{id}/clusters/{label}/eject           -> Eject a face from cluster
    6. GET    /albums/{id}/clusters/{label}/download/{pid}  -> Download single encrypted blob

SECURITY:
    All endpoints require authentication via JWT Bearer token.
    Photos returned are AES-256 encrypted — server cannot read them.
    Only the mobile app with the session key can decrypt.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.album import Album
from app.models.cluster import Cluster
from app.models.edit import ClusterEdit
from app.models.face_detection import FaceDetection
from app.models.photo import Photo
from app.schemas.cluster import (
    ClusterDTO,
    ClusterPhotosResponse,
    ClustersResponse,
    EjectFaceRequest,
    MergeClustersRequest,
    RenameClusterRequest,
)
from app.services.storage.local_store import LocalStore

router = APIRouter()


# ── Helper: verify album ownership ───────────────────────────────

def _get_album_or_403(album_id: str, user_id: str, db: Session) -> Album:
    """Load album and verify the current user owns it."""
    album = db.get(Album, album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your album")
    return album


# ── List Clusters ────────────────────────────────────────────────

@router.get("/{album_id}/clusters", response_model=ClustersResponse)
def get_clusters(
    album_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all face clusters for an album.

    Returns cluster labels, display names, face counts, and unidentified count.
    The mobile app uses this to render the face grid screen.
    """
    album = _get_album_or_403(album_id, user_id, db)
    if album.status != "complete":
        raise HTTPException(status_code=400, detail="Album not yet processed")

    clusters = (
        db.query(Cluster)
        .filter(Cluster.album_id == album_id)
        .order_by(Cluster.cluster_label.asc())
        .all()
    )

    # Count unidentified faces (cluster_label == -1)
    unid_count = (
        db.query(FaceDetection)
        .filter(FaceDetection.album_id == album_id, FaceDetection.cluster_label == -1)
        .count()
    )

    return ClustersResponse(
        album_id=album_id,
        clusters=[
            ClusterDTO(
                cluster_label=c.cluster_label,
                display_name=c.display_name,
                face_count=c.face_count,
            )
            for c in clusters
        ],
        unidentified_count=unid_count,
    )


# ── Photos in a Cluster ─────────────────────────────────────────

@router.get("/{album_id}/clusters/{cluster_label}/photos", response_model=ClusterPhotosResponse)
def get_cluster_photos(
    album_id: str,
    cluster_label: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get encrypted photo URLs for all photos containing faces in this cluster.

    The mobile app downloads each encrypted blob and decrypts locally
    using the session key (V1) or room key (V2).
    """
    _get_album_or_403(album_id, user_id, db)

    # Find all face detections in this cluster
    face_dets = (
        db.query(FaceDetection)
        .filter(
            FaceDetection.album_id == album_id,
            FaceDetection.cluster_label == cluster_label,
        )
        .all()
    )

    if not face_dets:
        raise HTTPException(status_code=404, detail="Cluster not found or empty")

    # Get unique photos and their encrypted blob URLs
    photo_ids = list({fd.photo_id for fd in face_dets})
    photos = db.query(Photo).filter(Photo.id.in_(photo_ids)).all()

    photo_urls = []
    for photo in photos:
        faces_in_cluster = sum(1 for fd in face_dets if fd.photo_id == photo.id)
        photo_urls.append({
            "photo_id": photo.id,
            "encrypted_blob_url": f"/api/v1/albums/{album_id}/clusters/{cluster_label}/download/{photo.id}",
            "faces_in_cluster": faces_in_cluster,
        })

    return ClusterPhotosResponse(
        album_id=album_id,
        cluster_label=cluster_label,
        photo_urls=photo_urls,
    )


# ── Download Encrypted Blob ─────────────────────────────────────

@router.get("/{album_id}/clusters/{cluster_label}/download/{photo_id}")
def download_encrypted_photo(
    album_id: str,
    cluster_label: int,
    photo_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Download a single encrypted photo blob.

    Returns the raw encrypted bytes. The mobile app decrypts using
    the session key stored locally on the device.

    Server returns this blob without being able to read its contents.
    """
    _get_album_or_403(album_id, user_id, db)

    # Verify the photo belongs to this album and cluster
    face_det = (
        db.query(FaceDetection)
        .filter(
            FaceDetection.album_id == album_id,
            FaceDetection.photo_id == photo_id,
            FaceDetection.cluster_label == cluster_label,
        )
        .first()
    )
    if not face_det:
        raise HTTPException(status_code=404, detail="Photo not in this cluster")

    photo = db.get(Photo, photo_id)
    if not photo or not photo.encrypted_blob_url:
        raise HTTPException(status_code=404, detail="Photo blob not found")

    store = LocalStore()
    blob = store.read_encrypted_blob(photo.encrypted_blob_url)

    return Response(
        content=blob,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{photo_id}.enc"'},
    )


# ── Rename Cluster ───────────────────────────────────────────────

@router.patch("/{album_id}/clusters/{cluster_label}/rename")
def rename_cluster(
    album_id: str,
    cluster_label: int,
    req: RenameClusterRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Rename a cluster's display name (e.g., 'Person 3' -> 'Priya')."""
    _get_album_or_403(album_id, user_id, db)

    row = (
        db.query(Cluster)
        .filter(Cluster.album_id == album_id, Cluster.cluster_label == cluster_label)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Cluster not found")

    row.display_name = req.new_name

    # Audit trail
    db.add(ClusterEdit(
        album_id=album_id,
        edit_type="rename",
        payload_json=json.dumps({
            "cluster_label": cluster_label,
            "new_name": req.new_name,
        }),
    ))
    db.commit()
    return {"success": True}


# ── Merge Clusters ───────────────────────────────────────────────

@router.post("/{album_id}/clusters/merge")
def merge_clusters(
    album_id: str,
    req: MergeClustersRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Merge two clusters — source gets dissolved into target.

    All face detections with source_cluster_label get reassigned to target_cluster_label.
    Cluster table is recomputed. Audit trail recorded.
    """
    _get_album_or_403(album_id, user_id, db)

    # Update all face detections from source to target
    affected = (
        db.query(FaceDetection)
        .filter(
            FaceDetection.album_id == album_id,
            FaceDetection.cluster_label == req.source_cluster_label,
        )
        .update({"cluster_label": req.target_cluster_label})
    )
    if affected == 0:
        raise HTTPException(status_code=404, detail="Source cluster not found or empty")

    # Recompute cluster table
    _recompute_cluster_table(db, album_id)

    # Audit trail
    db.add(ClusterEdit(
        album_id=album_id,
        edit_type="merge",
        payload_json=json.dumps({
            "source_cluster_label": req.source_cluster_label,
            "target_cluster_label": req.target_cluster_label,
        }),
    ))
    db.commit()
    return {"success": True, "faces_moved": affected}


# ── Eject Face ───────────────────────────────────────────────────

@router.post("/{album_id}/clusters/{cluster_label}/eject")
def eject_face(
    album_id: str,
    cluster_label: int,
    req: EjectFaceRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Remove a misclassified face from its cluster.

    The face's cluster_label is set to -1 (unidentified).
    Cluster table is recomputed. Audit trail recorded.
    """
    _get_album_or_403(album_id, user_id, db)

    fd = db.get(FaceDetection, req.face_detection_id)
    if not fd or fd.album_id != album_id or fd.cluster_label != cluster_label:
        raise HTTPException(status_code=404, detail="Face not found in this cluster")

    fd.cluster_label = -1

    # Recompute cluster table
    _recompute_cluster_table(db, album_id)

    # Audit trail
    db.add(ClusterEdit(
        album_id=album_id,
        edit_type="eject",
        payload_json=json.dumps({
            "face_detection_id": req.face_detection_id,
            "from_cluster_label": cluster_label,
        }),
    ))
    db.commit()
    return {"success": True}


# ── Helper: recompute cluster table from face_detections ─────────

def _recompute_cluster_table(db: Session, album_id: str) -> None:
    """Delete all Cluster rows for this album and rebuild from face_detections.

    This is called after merge/eject edits to keep the Cluster table
    consistent with the actual face_detection cluster_label values.
    """
    db.query(Cluster).filter(Cluster.album_id == album_id).delete()

    # Count faces per cluster (excluding -1 = unidentified)
    face_dets = (
        db.query(FaceDetection)
        .filter(FaceDetection.album_id == album_id, FaceDetection.cluster_label != -1)
        .all()
    )

    counts: dict[int, int] = {}
    for fd in face_dets:
        counts[fd.cluster_label] = counts.get(fd.cluster_label, 0) + 1

    for label, count in sorted(counts.items()):
        if count < 1:
            continue
        db.add(Cluster(
            album_id=album_id,
            cluster_label=label,
            display_name=f"Person {label}",
            face_count=count,
        ))

    db.flush()
