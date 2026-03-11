"""
Model registry — imports all ORM models so SQLAlchemy metadata.create_all() finds them.

When adding a new model:
    1. Create the model file in app/models/
    2. Import it here
    3. Add to __all__
"""

# ── V1 Active Models ──────────────────────────────────────────────
from app.models.user import User
from app.models.album import Album
from app.models.photo import Photo
from app.models.face_detection import FaceDetection
from app.models.cluster import Cluster
from app.models.job import PipelineJob
from app.models.edit import ClusterEdit

# ── V2 Stub Models (tables created, endpoints not wired yet) ─────
from app.models.room import Room
from app.models.room_member import RoomMember

__all__ = [
    # V1
    "User",
    "Album",
    "Photo",
    "FaceDetection",
    "Cluster",
    "PipelineJob",
    "ClusterEdit",
    # V2 stubs
    "Room",
    "RoomMember",
]
