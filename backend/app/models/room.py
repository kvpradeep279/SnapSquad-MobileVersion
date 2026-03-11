"""
Room model — V2 stub for group photo sharing rooms.

NOT ACTIVE IN V1. Tables are created but no endpoints use them yet.
Created now so the database schema is forward-compatible.

V2 DESIGN:
    - Organiser creates a room -> gets room_id + room_key (AES-256)
    - QR code encodes room_id + room_key + event name
    - All uploads to room encrypted with room_key
    - HDBSCAN clusters all embeddings across all room members
    - Public room: everyone sees all clusters
    - Private room: each member sees only their matched clusters
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), default="Untitled Room")

    # "public" or "private" — determines browse vs personal-only access
    room_type: Mapped[str] = mapped_column(String(20), default="public")

    # User who created this room
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )

    # Status: active -> expired -> deleted
    status: Mapped[str] = mapped_column(String(20), default="active")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    # Room expires after settings.room_expiry_days (default 30)
    # expires_at computed on creation based on config
