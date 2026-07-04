import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import numpy as np

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.album import Album
from app.models.cluster import Cluster
from app.models.global_identity import GlobalIdentity

router = APIRouter()

class ProfileMeRequest(BaseModel):
    embedding: List[float]

@router.post("/me")
def set_my_profile(
    payload: ProfileMeRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Sets the current user's face embedding so the clustering pipeline
    can automatically tag them as 'Me'.
    """
    if not payload.embedding or len(payload.embedding) == 0:
        raise HTTPException(status_code=400, detail="No embedding provided.")

    # Check if a "Me" identity already exists for this user
    me_identity = db.query(GlobalIdentity).filter(
        GlobalIdentity.user_id == user_id,
        GlobalIdentity.name == "Me"
    ).first()

    embedding_json = json.dumps(payload.embedding)

    if me_identity:
        me_identity.embedding_json = embedding_json
    else:
        me_identity = GlobalIdentity(
            user_id=user_id,
            name="Me",
            embedding_json=embedding_json
        )
        db.add(me_identity)
    
    # Retroactive Auto-Tagging: apply "Me" to existing clusters
    user_albums = db.query(Album.id).filter(Album.user_id == user_id).all()
    album_ids = [a.id for a in user_albums]
    
    if album_ids:
        existing_clusters = db.query(Cluster).filter(Cluster.album_id.in_(album_ids)).all()
        target_emb = np.array(payload.embedding, dtype=np.float32)
        
        for c in existing_clusters:
            if not c.centroid_json:
                continue
            try:
                c_emb = np.array(json.loads(c.centroid_json), dtype=np.float32)
                sim = float(np.dot(c_emb, target_emb))
                if sim >= 0.35:  # Strong similarity threshold for auto-tagging
                    c.display_name = "Me"
            except Exception:
                continue

    db.commit()

    return {"status": "success", "message": "Profile embedding set to 'Me' and applied retroactively."}

@router.get("/me/status")
def get_my_profile_status(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Checks if the user has set up their 'Me' profile picture/embedding.
    """
    me_identity = db.query(GlobalIdentity).filter(
        GlobalIdentity.user_id == user_id,
        GlobalIdentity.name == "Me"
    ).first()

    return {"has_profile": me_identity is not None}
