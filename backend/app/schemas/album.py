"""
Album schemas — create albums and check processing status.
"""

from pydantic import BaseModel


class AlbumCreateRequest(BaseModel):
    """Request to create a new album for photo uploads."""
    name: str = "Untitled Album"


class AlbumCreateResponse(BaseModel):
    """Returned when an album is created."""
    album_id: str
    status: str


class AlbumStatusResponse(BaseModel):
    """Returned when checking album processing status.

    The mobile app polls this endpoint while HDBSCAN is running.
    """
    album_id: str
    status: str        # created | uploading | uploaded | clustering | complete | failed
    stage: str         # Finer detail from PipelineJob
    total_photos: int
    total_faces: int
