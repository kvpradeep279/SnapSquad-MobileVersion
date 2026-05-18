import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GlobalIdentity(Base):
    """
    Stores the "Memory" of a named person for a specific user.
    When a user renames a cluster, the cluster's average embedding
    is saved here. Future clusters are compared against this for auto-tagging.
    """
    __tablename__ = "global_identities"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )
    
    # The name the user gave this person
    name: Mapped[str] = mapped_column(String(255), index=True)

    # Average embedding (centroid) of the face, stored as JSON array string
    embedding_json: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
