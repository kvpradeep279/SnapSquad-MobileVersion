"""
PipelineJob model — tracks async HDBSCAN clustering jobs.

Clustering runs as a background job via Redis + RQ because:
    - HDBSCAN on 500+ embeddings can take several seconds
    - The mobile app shouldn't block waiting for it
    - The app polls GET /albums/{id}/status until job completes

Status flow: queued -> processing -> complete | failed

V2 additions:
    - room_id: links job to a collaborative room (NULL for personal album jobs)
    - uploader_id: which member's upload batch triggered this job
    - photo_ids_json: JSON list of photo IDs in this batch (for audit/debug)
"""

import uuid
from datetime import datetime, timezone

from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PipelineJob(Base):
    __tablename__ = "pipeline_jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    album_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("albums.id"), index=True
    )
    rq_job_id: Mapped[str] = mapped_column(String(255), default="")

    # Status: queued -> processing -> complete | failed
    status: Mapped[str] = mapped_column(String(30), default="queued")

    # Stage gives finer detail: queued -> clustering -> saving -> complete
    stage: Mapped[str] = mapped_column(String(50), default="queued")

    # V2 Room fields (NULL for personal album jobs)
    # room_id: which collaborative room triggered this job
    room_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("rooms.id"), nullable=True, default=None, index=True
    )
    # uploader_id: which member's upload batch triggered this job
    uploader_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, default=None
    )
    # photo_ids_json: JSON list of photo IDs in this batch (for audit)
    photo_ids_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
