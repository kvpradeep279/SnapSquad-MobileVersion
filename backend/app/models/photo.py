"""
Photo model — represents a single uploaded photo (stored as encrypted blob).

SECURITY:
    The photo is AES-256 encrypted on the mobile device BEFORE upload.
    The server stores and serves encrypted blobs it CANNOT read.
    Only the device with the session_key (V1) or room_key (V2) can decrypt.

V1: encrypted_blob_url points to local storage or Cloudinary.
V2: Photos tagged with room_id for group access. Deleted after all
    matched members download + 30-day expiry.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    album_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("albums.id"), index=True
    )
    uploader_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )

    # Where the encrypted blob lives (Cloudinary URL or local file path)
    encrypted_blob_url: Mapped[str] = mapped_column(Text, default="")

    # Number of faces detected in this photo (by the mobile app)
    face_count: Mapped[int] = mapped_column(Integer, default=0)

    # Original filename from the mobile device (for display only)
    original_filename: Mapped[str] = mapped_column(String(255), default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
