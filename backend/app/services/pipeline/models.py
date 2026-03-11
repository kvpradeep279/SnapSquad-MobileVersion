"""
Data models for the clustering pipeline.

These models represent face data as received from the mobile app.
The mobile app performs detection (SCRFD) and embedding (MobileFaceNet)
on-device, then applies feature subtraction for privacy before sending
the protected embeddings to this server.

Server never sees raw embeddings or original photos.
"""

from dataclasses import dataclass, field

import numpy as np


@dataclass
class FaceData:
    """A single detected face with its protected embedding.

    Attributes:
        photo_id: UUID of the photo this face was detected in.
        face_index: Index of this face within the photo (0-based).
        bbox: Bounding box [x1, y1, x2, y2] from on-device SCRFD detection.
        det_score: Detection confidence score from SCRFD (0.0-1.0).
        embedding: 512-d protected embedding (feature-subtracted on device).
                   This is NOT the raw embedding — it has been L2-normalised,
                   had the private template subtracted, and re-normalised.
                   The server cannot invert this to reconstruct a face.
    """

    photo_id: str
    face_index: int
    bbox: list[int] = field(default_factory=lambda: [0, 0, 0, 0])
    det_score: float = 1.0
    embedding: np.ndarray = field(default_factory=lambda: np.zeros(512, dtype=np.float32))
