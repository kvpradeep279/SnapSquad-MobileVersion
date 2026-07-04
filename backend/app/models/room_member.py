"""
RoomMember model — V2 room membership tracking.

MEMBERSHIP LIFECYCLE:
    1. User scans QR → POST /rooms/{id}/request-join → status: pending
    2. Creator approves/rejects → status: approved or rejected
    3. Only approved members can upload, view photos, and trigger pipeline

ROLES:
    creator — The user who created the room. Cannot leave (must delete).
    member  — Any other approved participant.

EVENT MODE (room_type = "event"):
    identity_embedding_json stores the protected selfie embedding for
    Find Me matching. Registered via POST /rooms/{id}/register-identity.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RoomMember(Base):
    __tablename__ = "room_members"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    room_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rooms.id"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )

    # creator or member
    role: Mapped[str] = mapped_column(String(20), default="member")

    # pending -> approved | rejected
    # Only approved members have access to room content
    status: Mapped[str] = mapped_column(String(20), default="pending")

    # Cached display name for "Who Took This?" labels (avoids JOIN on every photo)
    display_name: Mapped[str] = mapped_column(String(255), default="")

    # Event Mode: protected selfie embedding stored here for Find Me matching
    # 192-element JSON array, derived on-device. Server cannot reconstruct face.
    identity_embedding_json: Mapped[str] = mapped_column(Text, default="")

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
