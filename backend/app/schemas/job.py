"""
Pipeline job schemas — trigger clustering and check progress.
"""

from pydantic import BaseModel


class ProcessAlbumResponse(BaseModel):
    """Returned when clustering is triggered for an album."""
    album_id: str
    job_id: str
    status: str  # "queued"
