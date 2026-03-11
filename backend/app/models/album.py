"""
Album model — a batch of photos uploaded by a single user.

V1: Each upload session creates one album. Contains metadata only —
    actual photos are stored as encrypted blobs in Cloudinary/local storage.
V2: Albums may belong to a Room instead of a single user.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Album(Base):
    __tablename__ = "albums"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), default="Untitled Album")
    total_photos: Mapped[int] = mapped_column(Integer, default=0)
    total_faces: Mapped[int] = mapped_column(Integer, default=0)

    # Status: created -> uploading -> uploaded -> clustering -> complete -> failed
    status: Mapped[str] = mapped_column(String(30), default="created")

    # Path to the clustering output JSON (stored by LocalStore)
    output_json: Mapped[str] = mapped_column(String(500), default="")

    # V2 future: link to room_id when albums belong to group rooms
    # room_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("rooms.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
