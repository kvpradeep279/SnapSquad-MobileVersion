"""
RoomMember model — V2 stub for room membership tracking.

NOT ACTIVE IN V1. Tables are created but no endpoints use them yet.

V2 DESIGN:
    - Members join by scanning QR code (POST /rooms/{id}/join)
    - Private rooms require face registration (3 selfies averaged into
      one identity embedding, feature-subtracted, stored here)
    - identity_embedding_json holds the protected identity vector
      for matching against photo clusters
"""

import uuid
from datetime import datetime, timezone

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

    # Protected identity embedding for private room matching (V2)
    # JSON array of 512 floats, feature-subtracted on device
    identity_embedding_json: Mapped[str] = mapped_column(Text, default="")

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
