"""
PipelineJob model — tracks async HDBSCAN clustering jobs.

Clustering runs as a background job via Redis + RQ because:
    - HDBSCAN on 500+ embeddings can take several seconds
    - The mobile app shouldn't block waiting for it
    - The app polls GET /albums/{id}/status until job completes

Status flow: queued -> processing -> complete | failed
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
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

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
