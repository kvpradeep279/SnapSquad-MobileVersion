from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.cluster import Cluster
from app.models.album import Album
from app.models.photo import Photo
from app.models.face_detection import FaceDetection

router = APIRouter()

@router.get("")
def get_your_people(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    from sqlalchemy import or_
    from app.models.room import Room
    from app.models.room_member import RoomMember

    room_album_ids = [
        row[0] for row in db.query(Room.shadow_album_id).join(
            RoomMember, Room.id == RoomMember.room_id
        ).filter(
            RoomMember.user_id == user_id,
            RoomMember.status == "approved",
            Room.shadow_album_id.isnot(None)
        ).all()
    ]

    clusters = db.query(Cluster, Album).join(Album, Cluster.album_id == Album.id).filter(
        or_(Album.user_id == user_id, Album.id.in_(room_album_ids)),
        ~Cluster.display_name.like("Person %"),
        Cluster.display_name != ""
    ).all()
    people_map = {}
    for c, a in clusters:
        name = c.display_name
        if name not in people_map:
            # Get a thumbnail photo
            fd = db.query(FaceDetection).filter(
                FaceDetection.album_id == c.album_id,
                FaceDetection.cluster_label == c.cluster_label
            ).first()
            thumb_album_id = None
            thumb_photo_id = None
            thumb_bbox = None
            if fd:
                photo = db.get(Photo, fd.photo_id)
                if photo:
                    thumb_album_id = c.album_id
                    thumb_photo_id = photo.id
                    thumb_bbox = [float(x) for x in fd.bbox.split(",")] if fd.bbox else [0, 0, 0, 0]
                    
            people_map[name] = {
                "name": name,
                "total_faces": 0,
                "thumbnail_album_id": thumb_album_id,
                "thumbnail_photo_id": thumb_photo_id,
                "thumbnail_bbox": thumb_bbox
            }
            
        people_map[name]["total_faces"] += c.face_count
        
    return {"people": list(people_map.values())}


@router.get("/{name}/photos")
def get_person_photos(
    name: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    from sqlalchemy import or_
    from app.models.room import Room
    from app.models.room_member import RoomMember

    room_album_ids = [
        row[0] for row in db.query(Room.shadow_album_id).join(
            RoomMember, Room.id == RoomMember.room_id
        ).filter(
            RoomMember.user_id == user_id,
            RoomMember.status == "approved",
            Room.shadow_album_id.isnot(None)
        ).all()
    ]

    clusters = db.query(Cluster, Album).join(Album, Cluster.album_id == Album.id).filter(
        or_(Album.user_id == user_id, Album.id.in_(room_album_ids)),
        Cluster.display_name == name
    ).all()
    unique_photos = {}
    
    for c, a in clusters:
        face_dets = db.query(FaceDetection).filter(
            FaceDetection.album_id == c.album_id,
            FaceDetection.cluster_label == c.cluster_label
        ).all()
        
        photo_ids = list({fd.photo_id for fd in face_dets})
        photos = db.query(Photo).filter(Photo.id.in_(photo_ids)).all()
        
        for p in photos:
            # Deduplicate based on the original filename from the mobile device.
            # If original_filename is missing for some reason, fallback to photo.id
            dedup_key = p.original_filename if p.original_filename else p.id
            
            if dedup_key not in unique_photos:
                unique_photos[dedup_key] = {
                    "photo_id": p.id,
                    "album_id": c.album_id,
                    "cluster_label": c.cluster_label,
                    "encrypted_blob_url": f"/api/v1/albums/{c.album_id}/clusters/{c.cluster_label}/download/{p.id}",
                }
                
    return {"photos": list(unique_photos.values())}
