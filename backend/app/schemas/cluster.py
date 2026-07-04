"""
Cluster schemas — viewing, renaming, merging, and ejecting clusters.
"""

from pydantic import BaseModel, Field


class ClusterDTO(BaseModel):
    """A single cluster in the response."""
    cluster_label: int
    display_name: str
    face_count: int
    photo_count: int = 0  # Added photo_count
    representative_face: dict | None = None  # {"photo_id": str, "bbox": [float, float, float, float]}
    is_me: bool = False


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
    """Remove a misclassified face from its cluster. (Deprecated)"""
    face_detection_id: str = Field(..., description="UUID of the FaceDetection record to eject")

class EjectPhotosRequest(BaseModel):
    """Remove multiple photos from a cluster."""
    photo_ids: list[str] = Field(..., description="List of photo UUIDs to eject from this cluster")


class PromoteFacesRequest(BaseModel):
    """Promote unidentified faces into a specific cluster (or create a new one)."""
    photo_ids: list[str] = Field(..., description="List of photo UUIDs to promote")
    new_name: str = Field(..., min_length=1, max_length=255)

class MergeFaceRequest(BaseModel):
    """Merge a specific face into an existing cluster without recalculating centroid."""
    target_cluster_label: int = Field(..., description="Cluster to merge INTO")

class CreateClusterFromFaceRequest(BaseModel):
    """Extract a single face into a new cluster."""
    new_name: str = Field(..., min_length=1, max_length=255)
