"""
Room model — V2 collaborative photo sharing rooms.

TWO ROOM TYPES:
    - shared: Multiple uploaders (friends trip, birthday, fest)
      All members upload their own photos. Creator approves/rejects join requests.
      Faces clustered across ALL members' uploads.

    - event: Single uploader (college fest, wedding, conference)
      Only creator uploads all photos.
      Attendees join, register selfie, and use 'Find Me' to retrieve their photos.

SHADOW ALBUM PATTERN:
    Each room auto-creates a hidden Album (shadow_album_id) on creation.
    All room photo uploads go into this album. The existing HDBSCAN pipeline
    works unchanged — it just sees a larger album with multiple uploaders.

ENCRYPTION:
    Deferred to V3. All V2 rooms use unencrypted storage.
    room_key_hash is reserved for future E2EE implementation.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), default="Untitled Room")

    # "shared" (multi-uploader) or "event" (single uploader + Find Me)
    room_type: Mapped[str] = mapped_column(String(20), default="shared")

    # User who created this room (always a member with role="creator")
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )

    # Hidden album that stores all room photos (shadow album pattern)
    # Created atomically with the room. NULL only briefly during creation.
    shadow_album_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("albums.id"), nullable=True, default=None
    )

    # Status: active -> expired -> deleted
    status: Mapped[str] = mapped_column(String(20), default="active")

    # Auto-expiry: shared rooms expire in 90 days, event rooms in 30 days
    auto_delete_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Max number of approved members (abuse prevention)
    max_members: Mapped[int] = mapped_column(Integer, default=50)

    # Reserved for V3 E2EE: salted SHA-256 of the room key (key never stored)
    room_key_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
