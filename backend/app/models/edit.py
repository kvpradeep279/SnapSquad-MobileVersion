"""
ClusterEdit model — audit log for user corrections to clustering results.

Users can:
    - Rename a cluster ("Person 3" -> "Priya")
    - Merge two clusters (HDBSCAN incorrectly split one person)
    - Eject a face from a cluster (HDBSCAN incorrectly grouped a face)

These edits are stored as an immutable audit trail. The cluster table
is recomputed after each edit. This allows undo functionality in V2.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ClusterEdit(Base):
    __tablename__ = "cluster_edits"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    album_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("albums.id"), index=True
    )
    # Edit type: "rename", "merge", "eject"
    edit_type: Mapped[str] = mapped_column(String(50))
    # JSON-serialised payload with edit details
    payload_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
