"""
Schema registry — re-exports all Pydantic schemas for convenient imports.
"""

from app.schemas.common import ApiResponse
from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest
from app.schemas.album import AlbumCreateRequest, AlbumCreateResponse, AlbumStatusResponse
from app.schemas.photo import FaceEmbeddingPayload, PhotoUploadRequest, PhotoUploadResponse
from app.schemas.cluster import (
    ClusterDTO,
    ClusterPhotosResponse,
    ClustersResponse,
    EjectFaceRequest,
    MergeClustersRequest,
    RenameClusterRequest,
)
from app.schemas.job import ProcessAlbumResponse

__all__ = [
    # Common
    "ApiResponse",
    # Auth
    "SignupRequest",
    "LoginRequest",
    "AuthResponse",
    # Album
    "AlbumCreateRequest",
    "AlbumCreateResponse",
    "AlbumStatusResponse",
    # Photo upload
    "FaceEmbeddingPayload",
    "PhotoUploadRequest",
    "PhotoUploadResponse",
    # Clusters
    "ClusterDTO",
    "ClustersResponse",
    "ClusterPhotosResponse",
    "RenameClusterRequest",
    "MergeClustersRequest",
    "EjectFaceRequest",
    # Jobs
    "ProcessAlbumResponse",
]
