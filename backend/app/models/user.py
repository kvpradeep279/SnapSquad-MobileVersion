"""
User model — registered app users.

Authentication is handled by Firebase Auth. The User table stores
the Firebase UID as the primary key and caches profile info from
the user's Google account (display name, photo URL).
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    # Firebase UID is used directly as the primary key.
    # This eliminates the need for a separate UUID and simplifies lookups.
    id: Mapped[str] = mapped_column(
        String(128), primary_key=True
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    # Profile fields populated from Google account on first sign-in
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    push_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
