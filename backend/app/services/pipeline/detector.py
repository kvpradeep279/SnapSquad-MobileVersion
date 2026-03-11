"""
Embedding loader — receives pre-computed protected embeddings.

IMPORTANT ARCHITECTURE NOTE:
    This module does NOT run any ML models. All face detection (SCRFD)
    and embedding extraction (MobileFaceNet) happens on the mobile device.
    The mobile app also applies Feature Subtraction (CVPR 2024) on-device
    before transmitting embeddings to this server.

    This module converts received embedding data into FaceData objects
    for the clustering pipeline.

V2 NOTE:
    In V2 (rooms), embeddings arrive from multiple users. This module
    treats all embeddings uniformly — the clustering algorithm doesn't
    need to know which user uploaded which embedding.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from app.services.pipeline.models import FaceData

# Embedding dimension for MobileFaceNet
EMBEDDING_DIM = 512


# ---------------------------------------------------------------------------
# Primary path: accept embeddings from API request payloads
# ---------------------------------------------------------------------------

def faces_from_embedding_dicts(embedding_dicts: list[dict]) -> list[FaceData]:
    """Convert a list of embedding dictionaries (from API request) to FaceData.

    Each dict is expected to have:
        - photo_id: str
        - face_index: int
        - bbox: list[int] (4 values)
        - det_score: float
        - embedding: list[float] (512 values, already protected via feature subtraction)

    The embedding is L2-normalised here as a safety measure, even though
    the mobile app already normalises after feature subtraction.
    """
    faces: list[FaceData] = []

    for row in embedding_dicts:
        emb = np.array(row["embedding"], dtype=np.float32)

        # Validate embedding dimension
        if emb.shape[0] != EMBEDDING_DIM:
            raise ValueError(
                f"Expected {EMBEDDING_DIM}-d embedding, got {emb.shape[0]}-d "
                f"(photo_id={row.get('photo_id')}, face_index={row.get('face_index')})"
            )

        # L2 normalise as safety net (mobile already does this)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        faces.append(
            FaceData(
                photo_id=row.get("photo_id", ""),
                face_index=int(row.get("face_index", 0)),
                bbox=[int(v) for v in row.get("bbox", [0, 0, 0, 0])],
                det_score=float(row.get("det_score", 1.0)),
                embedding=emb,
            )
        )

    return faces


# ---------------------------------------------------------------------------
# Secondary path: load from JSON file (for testing / snapshot comparison)
# ---------------------------------------------------------------------------

def load_faces_from_embeddings_json(path: str | Path) -> list[FaceData]:
    """Load face embeddings from a JSON file on disk.

    Used only for:
        - Running the snapshot comparison test (scripts/run_pipeline_snapshot.py)
        - Local development / debugging

    In production, embeddings arrive via the API (faces_from_embedding_dicts).
    """
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    faces: list[FaceData] = []

    for i, row in enumerate(payload):
        emb = np.array(row["embedding"], dtype=np.float32)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        faces.append(
            FaceData(
                photo_id=row.get("image", f"img_{i}.jpg"),
                face_index=int(row.get("face_index", 0)),
                bbox=[int(v) for v in row.get("bbox", [0, 0, 0, 0])],
                det_score=float(row.get("det_score", 1.0)),
                embedding=emb,
            )
        )

    return faces
