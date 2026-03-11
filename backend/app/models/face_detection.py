"""
FaceDetection model — a single face detected in a photo.

ARCHITECTURE:
    Detection and embedding extraction happen on the MOBILE DEVICE.
    The mobile app sends the protected embedding (after feature subtraction)
    to the server. This model stores that protected embedding.

PRIVACY:
    The embedding stored here is NOT the raw MobileFaceNet output.
    It has been: L2-normalised -> private_template subtracted -> re-normalised.
    Without the private_template (which never leaves the device), the original
    embedding cannot be recovered. Inversion attacks (DiffUMI, IdDecoder) fail.

    The server CAN compute cosine similarities between protected embeddings
    (for HDBSCAN clustering) because feature subtraction preserves relative
    distances. This is the mathematical property our privacy relies on.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FaceDetection(Base):
    __tablename__ = "face_detections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    photo_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("photos.id"), index=True
    )
    album_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("albums.id"), index=True
    )

    # Face index within this photo (0-based, from mobile SCRFD detection)
    face_index: Mapped[int] = mapped_column(Integer, default=0)

    # Bounding box from SCRFD: "x1,y1,x2,y2" stored as text for simplicity.
    # pgvector handles the embedding; bbox is metadata only.
    bbox: Mapped[str] = mapped_column(String(100), default="0,0,0,0")

    # Detection confidence from SCRFD (0.0–1.0)
    det_score: Mapped[float] = mapped_column(Float, default=1.0)

    # Protected 512-d embedding stored as JSON text.
    # In production with pgvector, this would be a Vector(512) column
    # for native cosine similarity queries. For V1 MVP, we store as text
    # and load into numpy for HDBSCAN. Easy to migrate to pgvector later.
    embedding_json: Mapped[str] = mapped_column(Text, default="")

    # Cluster label assigned by HDBSCAN (-1 = unidentified/noise)
    cluster_label: Mapped[int] = mapped_column(Integer, default=-1)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
