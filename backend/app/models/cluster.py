"""
Cluster model — a group of faces identified as the same person by HDBSCAN.

V1: Each cluster gets a numeric label and optional display name.
    Users can rename clusters ("Person 3" -> "Rahul"), merge wrong splits,
    or eject misclassified faces.

V2: Clusters may be linked to registered identity embeddings for
    automatic person matching in private rooms.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Cluster(Base):
    __tablename__ = "clusters"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    album_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("albums.id"), index=True
    )
    cluster_label: Mapped[int] = mapped_column(Integer, index=True)
    display_name: Mapped[str] = mapped_column(String(255), default="")
    face_count: Mapped[int] = mapped_column(Integer, default=0)

    # V2 future: matched_user_id for private room identity matching
    # matched_user_id: Mapped[str | None] = mapped_column(
    #     String(36), ForeignKey("users.id"), nullable=True
    # )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
