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
    EjectPhotosRequest,
    MergeClustersRequest,
    RenameClusterRequest,
    PromoteFacesRequest,
)
from app.services.storage.local_store import LocalStore

router = APIRouter()


# ── Helper: verify album ownership ───────────────────────────────

def _get_album_or_403(album_id: str, user_id: str, db: Session) -> Album:
    """Load album and verify either the current user owns it, or it is a shadow album
    of a room where the current user is an approved member.
    """
    album = db.get(Album, album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    
    # 1. Personal album owner check
    if album.user_id == user_id:
        return album

    # 2. Collaborative Room member check
    from app.models.room import Room
    from app.models.room_member import RoomMember

    room = db.query(Room).filter(Room.shadow_album_id == album_id).first()
    if room:
        member = db.query(RoomMember).filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == user_id,
            RoomMember.status == "approved"
        ).first()
        if member:
            return album

    raise HTTPException(status_code=403, detail="Not authorized to access this album")


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

    # For each cluster, find one representative face
    cluster_dtos = []
    for c in clusters:
        rep_face = db.query(FaceDetection).filter(
            FaceDetection.album_id == album_id,
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
                
        # Count unique photos for this cluster
        unique_photos_count = (
            db.query(FaceDetection.photo_id)
            .filter(FaceDetection.album_id == album_id, FaceDetection.cluster_label == c.cluster_label)
            .distinct()
            .count()
        )

        # Hide noise: only return clusters that span 2 or more distinct photos.
        if unique_photos_count < 2:
            continue

        cluster_dtos.append(
            ClusterDTO(
                cluster_label=c.cluster_label,
                display_name=c.display_name,
                face_count=c.face_count,
                photo_count=unique_photos_count,
                representative_face=rep_face_dict,
            )
        )

    # Inject Unidentified Cluster if there are unclustered faces
    if unid_count > 0:
        rep_face_unid = db.query(FaceDetection).filter(
            FaceDetection.album_id == album_id,
            FaceDetection.cluster_label == -1
        ).first()
        
        rep_face_unid_dict = None
        if rep_face_unid and rep_face_unid.bbox:
            try:
                bbox_list = [float(x) for x in rep_face_unid.bbox.split(",")]
                rep_face_unid_dict = {
                    "photo_id": rep_face_unid.photo_id,
                    "bbox": bbox_list
                }
            except Exception:
                pass
                
        unique_photos_unid_count = (
            db.query(FaceDetection.photo_id)
            .filter(FaceDetection.album_id == album_id, FaceDetection.cluster_label == -1)
            .distinct()
            .count()
        )

        cluster_dtos.append(
            ClusterDTO(
                cluster_label=-1,
                display_name="Unidentified",
                face_count=unid_count,
                photo_count=unique_photos_unid_count,
                representative_face=rep_face_unid_dict,
                is_me=False,
            )
        )

    return ClustersResponse(
        album_id=album_id,
        clusters=cluster_dtos,
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
        photo_face_dets = [fd for fd in face_dets if fd.photo_id == photo.id]
        photo_urls.append({
            "photo_id": photo.id,
            "encrypted_blob_url": f"/api/v1/albums/{album_id}/clusters/{cluster_label}/download/{photo.id}",
            "faces_in_cluster": len(photo_face_dets),
            "face_ids": [fd.id for fd in photo_face_dets],
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

    try:
        from app.services.storage.storage_backend import get_store_for_path
        store = get_store_for_path(photo.encrypted_blob_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    from app.services.storage.r2_store import R2Store
    if isinstance(store, R2Store):
        from fastapi.responses import StreamingResponse
        try:
            body, length = store.stream_encrypted_blob(photo.encrypted_blob_url)
        except Exception as exc:
            raise HTTPException(status_code=404, detail=f"Photo not available: {exc}")
        
        headers = {"Content-Disposition": f'attachment; filename="{photo_id}.enc"'}
        if length:
            headers["Content-Length"] = str(length)
            
        return StreamingResponse(
            body.iter_chunks(chunk_size=65536),
            media_type="application/octet-stream",
            headers=headers,
        )
    else:
        from fastapi.responses import FileResponse
        blob_path = store.get_encrypted_blob_path(album_id, photo_id)
        return FileResponse(
            blob_path,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{photo_id}.enc"'}
        )

# ── Delete Cluster ──────────────────────────────────────────────

@router.delete("/{album_id}/clusters/{cluster_label}")
def delete_cluster(
    album_id: str,
    cluster_label: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Delete a cluster.
    
    This sets all faces in the cluster to unidentified (-1) and removes the cluster.
    Photos are not deleted.
    """
    _get_album_or_403(album_id, user_id, db)

    cluster = db.query(Cluster).filter(
        Cluster.album_id == album_id,
        Cluster.cluster_label == cluster_label
    ).first()

    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    # Set faces to un-clustered (-1)
    db.query(FaceDetection).filter(
        FaceDetection.album_id == album_id,
        FaceDetection.cluster_label == cluster_label
    ).update({"cluster_label": -1})

    # Delete the cluster
    db.delete(cluster)
    
    # Audit trail
    db.add(ClusterEdit(
        album_id=album_id,
        edit_type="delete_cluster",
        payload_json=json.dumps({
            "deleted_cluster_label": cluster_label,
            "display_name": cluster.display_name
        }),
    ))
    db.commit()

    return {"success": True, "message": "Cluster deleted"}


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

    # --- Save to GlobalIdentity (Auto-Tagging Memory) ---
    from app.models.global_identity import GlobalIdentity
    from app.models.face_detection import FaceDetection
    import numpy as np
    import json

    face_dets = db.query(FaceDetection).filter(
        FaceDetection.album_id == album_id,
        FaceDetection.cluster_label == cluster_label,
        FaceDetection.embedding_json != ""
    ).all()

    if face_dets:
        embeddings = [json.loads(fd.embedding_json) for fd in face_dets]
        if embeddings:
            centroid = np.mean(embeddings, axis=0)
            centroid = centroid / (np.linalg.norm(centroid) + 1e-10)
            centroid_json = json.dumps(centroid.tolist())

            global_id = db.query(GlobalIdentity).filter(
                GlobalIdentity.user_id == user_id,
                GlobalIdentity.name == req.new_name
            ).first()
            if not global_id:
                global_id = GlobalIdentity(user_id=user_id, name=req.new_name, embedding_json=centroid_json)
                db.add(global_id)
            else:
                global_id.embedding_json = centroid_json

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

from app.schemas.cluster import EjectPhotosRequest

@router.post("/{album_id}/clusters/{cluster_label}/eject")
def eject_photos(
    album_id: str,
    cluster_label: int,
    req: EjectPhotosRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Remove multiple photos from a cluster.

    The faces in these photos have their cluster_label set to -1 (unidentified).
    Cluster table is recomputed. Audit trail recorded.
    """
    _get_album_or_403(album_id, user_id, db)

    affected = (
        db.query(FaceDetection)
        .filter(
            FaceDetection.album_id == album_id,
            FaceDetection.cluster_label == cluster_label,
            FaceDetection.photo_id.in_(req.photo_ids)
        )
        .update({"cluster_label": -1}, synchronize_session=False)
    )

    if affected == 0:
        raise HTTPException(status_code=404, detail="No faces found in these photos for this cluster")

    # Recompute cluster table
    _recompute_cluster_table(db, album_id)

    # Audit trail
    db.add(ClusterEdit(
        album_id=album_id,
        edit_type="eject",
        payload_json=json.dumps({
            "photo_ids": req.photo_ids,
            "from_cluster_label": cluster_label,
        }),
    ))
    db.commit()
    return {"success": True}


# ── Unidentified Faces ──────────────────────────────────────────

@router.get("/{album_id}/clusters/-1/faces")
def get_unidentified_faces(
    album_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Returns a list of all unidentified faces with thumbnails."""
    _get_album_or_403(album_id, user_id, db)

    face_dets = (
        db.query(FaceDetection)
        .filter(
            FaceDetection.album_id == album_id,
            FaceDetection.cluster_label == -1
        )
        .all()
    )

    faces = []
    for fd in face_dets:
        bbox_list = [float(x) for x in fd.bbox.split(",")] if fd.bbox else [0, 0, 0, 0]
        faces.append({
            "photo_id": fd.photo_id,
            "bbox": bbox_list,
            "face_detection_id": fd.id,
        })
    
    # We could theoretically do loose similarity grouping here and return nested lists,
    # but returning a flat list is simpler, and we can group in the frontend if needed,
    # or just sort by time/photo ID so similar photos are next to each other.

    return {"faces": faces}

@router.post("/{album_id}/clusters/-1/promote")
def promote_unidentified_faces(
    album_id: str,
    req: PromoteFacesRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Promotes selected unidentified faces into a new (or existing) named cluster."""
    _get_album_or_403(album_id, user_id, db)

    # 1. Find an existing cluster with that name, or create a new label
    existing_cluster = db.query(Cluster).filter(
        Cluster.album_id == album_id,
        Cluster.display_name == req.new_name
    ).first()

    if existing_cluster:
        new_label = existing_cluster.cluster_label
    else:
        # Find max cluster label
        max_label_row = db.query(Cluster.cluster_label).filter(Cluster.album_id == album_id).order_by(Cluster.cluster_label.desc()).first()
        new_label = (max_label_row[0] + 1) if max_label_row else 0

        # We don't add the cluster row here, we'll let _recompute_cluster_table do it
        # but we need to pass the custom name to the recompute logic somehow.
        # So actually let's insert a dummy row or just handle it.
        # Actually _recompute_cluster_table takes existing clusters and maps their names.
        # So we MUST create the cluster row first so it knows the name.
        db.add(Cluster(
            album_id=album_id,
            cluster_label=new_label,
            display_name=req.new_name,
            face_count=0
        ))
        db.flush()

    # 2. Update face_detections for these photos
    # Wait, req.photo_ids means ALL faces in those photos? What if there are multiple unidentified faces in one photo?
    # It's better to update by photo_id AND cluster_label == -1. If there's 2 unidentified faces in one photo, they both get promoted.
    affected = (
        db.query(FaceDetection)
        .filter(
            FaceDetection.album_id == album_id,
            FaceDetection.cluster_label == -1,
            FaceDetection.photo_id.in_(req.photo_ids)
        )
        .update({"cluster_label": new_label}, synchronize_session=False)
    )

    if affected == 0:
        raise HTTPException(status_code=400, detail="No unidentified faces found for the given photos")

    # 3. Recompute cluster counts
    _recompute_cluster_table(db, album_id)

    # 4. Audit trail
    db.add(ClusterEdit(
        album_id=album_id,
        edit_type="promote",
        payload_json=json.dumps({
            "photo_ids": req.photo_ids,
            "new_label": new_label,
            "new_name": req.new_name
        }),
    ))
    db.commit()

    return {"success": True, "faces_promoted": affected, "cluster_label": new_label}


# ── Helper: recompute cluster table from face_detections ─────────

def _recompute_cluster_table(db: Session, album_id: str) -> None:
    """Delete all Cluster rows for this album and rebuild from face_detections.

    This is called after merge/eject edits to keep the Cluster table
    consistent with the actual face_detection cluster_label values.
    """
    # 1. Fetch existing names and centroids before deleting
    existing_clusters = db.query(Cluster).filter(Cluster.album_id == album_id).all()
    cluster_metadata = {
        c.cluster_label: {
            "display_name": c.display_name,
            "centroid_json": c.centroid_json
        } for c in existing_clusters
    }

    # 2. Delete existing clusters
    db.query(Cluster).filter(Cluster.album_id == album_id).delete()

    # 3. Count faces per cluster (excluding -1 = unidentified)
    face_dets = (
        db.query(FaceDetection)
        .filter(FaceDetection.album_id == album_id, FaceDetection.cluster_label != -1)
        .all()
    )

    counts: dict[int, int] = {}
    for fd in face_dets:
        counts[fd.cluster_label] = counts.get(fd.cluster_label, 0) + 1

    # 4. Rebuild clusters, restoring metadata where available
    for label, count in sorted(counts.items()):
        if count < 1:
            continue
            
        meta = cluster_metadata.get(label, {})
        
        db.add(Cluster(
            album_id=album_id,
            cluster_label=label,
            display_name=meta.get("display_name", f"Person {label}"),
            centroid_json=meta.get("centroid_json") or "",
            face_count=count,
        ))

    db.flush()


# ── Face Triage Endpoints ────────────────────────────────────────

from app.schemas.cluster import MergeFaceRequest, CreateClusterFromFaceRequest

@router.delete("/{album_id}/faces/{face_id}")
def delete_face(
    album_id: str,
    face_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Hard delete a single face detection (Triage override)."""
    _get_album_or_403(album_id, user_id, db)
    
    face = db.query(FaceDetection).filter(
        FaceDetection.id == face_id,
        FaceDetection.album_id == album_id
    ).first()
    
    if not face:
        raise HTTPException(status_code=404, detail="Face not found")
        
    db.delete(face)
    _recompute_cluster_table(db, album_id)
    db.commit()
    
    return {"success": True}

@router.patch("/{album_id}/faces/{face_id}/merge")
def merge_face(
    album_id: str,
    face_id: str,
    req: MergeFaceRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Move a single face into an existing cluster without recalculating centroid."""
    _get_album_or_403(album_id, user_id, db)
    
    face = db.query(FaceDetection).filter(
        FaceDetection.id == face_id,
        FaceDetection.album_id == album_id
    ).first()
    
    if not face:
        raise HTTPException(status_code=404, detail="Face not found")
        
    target_cluster = db.query(Cluster).filter(
        Cluster.album_id == album_id,
        Cluster.cluster_label == req.target_cluster_label
    ).first()
    
    if not target_cluster and req.target_cluster_label != -1:
        raise HTTPException(status_code=404, detail="Target cluster not found")
        
    face.cluster_label = req.target_cluster_label
    _recompute_cluster_table(db, album_id)
    db.commit()
    
    return {"success": True}

@router.post("/{album_id}/faces/{face_id}/create_cluster")
def create_cluster_from_face(
    album_id: str,
    face_id: str,
    req: CreateClusterFromFaceRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Promote a single face to a brand new cluster and set its embedding as the new centroid."""
    _get_album_or_403(album_id, user_id, db)
    
    face = db.query(FaceDetection).filter(
        FaceDetection.id == face_id,
        FaceDetection.album_id == album_id
    ).first()
    
    if not face:
        raise HTTPException(status_code=404, detail="Face not found")
        
    # Get highest cluster label
    max_label_row = db.query(Cluster.cluster_label).filter(Cluster.album_id == album_id).order_by(Cluster.cluster_label.desc()).first()
    new_label = (max_label_row[0] + 1) if max_label_row else 1
    
    face.cluster_label = new_label
    
    db.add(Cluster(
        album_id=album_id,
        cluster_label=new_label,
        display_name=req.new_name,
        centroid_json=face.embedding_json or "",  # Use this face's embedding directly, fallback to empty string
        face_count=1,
    ))
    
    _recompute_cluster_table(db, album_id)
    db.commit()
    
    return {"success": True, "new_cluster_label": new_label}
