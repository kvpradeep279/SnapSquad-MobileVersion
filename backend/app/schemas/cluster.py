"""
Cluster schemas — viewing, renaming, merging, and ejecting clusters.
"""

from pydantic import BaseModel, Field


class ClusterDTO(BaseModel):
    """A single cluster in the response."""
    cluster_label: int
    display_name: str
    face_count: int
    # V2: may include representative_face_thumbnail_url


class ClustersResponse(BaseModel):
    """Response for GET /albums/{album_id}/clusters."""
    album_id: str
    clusters: list[ClusterDTO]
    unidentified_count: int  # Faces with cluster_label == -1


class ClusterPhotosResponse(BaseModel):
    """Response for GET /albums/{album_id}/clusters/{cluster_label}/photos.

    Returns encrypted blob URLs for photos containing faces in this cluster.
    The mobile app downloads and decrypts these blobs using its local key.
    """
    album_id: str
    cluster_label: int
    photo_urls: list[dict]  # [{photo_id, encrypted_blob_url, face_count_in_cluster}]


class RenameClusterRequest(BaseModel):
    """Rename a cluster's display name (e.g., 'Person 3' -> 'Rahul')."""
    new_name: str = Field(..., min_length=1, max_length=255)


class MergeClustersRequest(BaseModel):
    """Merge two clusters (HDBSCAN incorrectly split one person)."""
    source_cluster_label: int = Field(..., description="Cluster to merge FROM (will be dissolved)")
    target_cluster_label: int = Field(..., description="Cluster to merge INTO (will absorb faces)")


class EjectFaceRequest(BaseModel):
    """Remove a misclassified face from its cluster."""
    face_detection_id: str = Field(..., description="UUID of the FaceDetection record to eject")
