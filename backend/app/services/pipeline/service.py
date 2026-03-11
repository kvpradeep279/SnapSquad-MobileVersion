"""
Pipeline service — orchestrates clustering on protected embeddings.

ARCHITECTURE:
    Mobile app -> sends protected embeddings + encrypted photos -> Server
    Server -> runs HDBSCAN clustering (pure math) -> returns cluster labels
    Server NEVER runs ML models. Zero model files on the server.

V1 (current):
    Single-user album. Embeddings come from one device via POST.
    run_pipeline_on_embeddings() is the primary entry point.

V2 (future):
    Multi-user room. Embeddings come from multiple devices.
    Same clustering function — cluster_faces_v21() treats all
    embeddings uniformly regardless of source.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.services.pipeline.clustering import cluster_faces_v21
from app.services.pipeline.config import (
    COHERENCE_SPLIT,
    HDBSCAN_CONFIG,
    MERGE_PASS1,
    MERGE_PASS2,
    OUTLIER_CONFIG,
    POST_VALIDATION,
    RESCUE_PASS1,
    RESCUE_PASS2,
)
from app.services.pipeline.detector import (
    faces_from_embedding_dicts,
    load_faces_from_embeddings_json,
)
from app.services.pipeline.models import FaceData


def get_pipeline_config() -> dict:
    """Return the full clustering configuration dictionary.

    All thresholds are tuned from notebook experiments (Notebook 3 & 4).
    These values produce 10 clusters from 107 test faces with 74.8% clustering rate.
    """
    return {
        "hdbscan": HDBSCAN_CONFIG,
        "post_validation": POST_VALIDATION,
        "merge_pass1": MERGE_PASS1,
        "merge_pass2": MERGE_PASS2,
        "rescue_pass1": RESCUE_PASS1,
        "rescue_pass2": RESCUE_PASS2,
        "outlier": OUTLIER_CONFIG,
        "coherence_split": COHERENCE_SPLIT,
    }


# ---------------------------------------------------------------------------
# Primary entry point — V1 production path
# ---------------------------------------------------------------------------

def run_pipeline_on_embeddings(embedding_dicts: list[dict]) -> dict:
    """Run the 10-stage HDBSCAN clustering pipeline on protected embeddings.

    Args:
        embedding_dicts: List of dicts from the API, each containing:
            photo_id, face_index, bbox, det_score, embedding (512 floats)

    Returns:
        Dict with keys: summary, cluster_counts, labels, face_assignments
        face_assignments maps each face to its cluster for easy lookup.
    """
    faces = faces_from_embedding_dicts(embedding_dicts)
    return _run_clustering(faces)


# ---------------------------------------------------------------------------
# Secondary entry point — testing / snapshot comparison only
# ---------------------------------------------------------------------------

def run_pipeline_from_embeddings_file(embeddings_json_path: str) -> dict:
    """Run clustering from a JSON file on disk. Used for tests only."""
    faces = load_faces_from_embeddings_json(embeddings_json_path)
    return _run_clustering(faces)


# ---------------------------------------------------------------------------
# Shared clustering logic
# ---------------------------------------------------------------------------

def _run_clustering(faces: list[FaceData]) -> dict:
    """Core clustering runner. Works identically on raw or protected embeddings.

    Feature subtraction preserves relative cosine distances between embeddings,
    so HDBSCAN produces the same cluster assignments whether given raw or
    protected embeddings. This is the mathematical property that makes
    our privacy architecture work.
    """
    serializable_faces = [
        {
            "photo_id": f.photo_id,
            "face_index": f.face_index,
            "bbox": f.bbox,
            "det_score": f.det_score,
            "embedding": f.embedding,
        }
        for f in faces
    ]

    labels, summary = cluster_faces_v21(serializable_faces, get_pipeline_config())

    # Build cluster_counts: {cluster_label: face_count}
    cluster_counts: dict[int, int] = {}
    for lb in labels.tolist():
        cluster_counts[lb] = cluster_counts.get(lb, 0) + 1

    # Build face_assignments: [{photo_id, face_index, cluster_label}, ...]
    # This makes it easy for the mobile app to know which face belongs where.
    face_assignments = [
        {
            "photo_id": faces[i].photo_id,
            "face_index": faces[i].face_index,
            "cluster_label": int(labels[i]),
        }
        for i in range(len(faces))
    ]

    return {
        "summary": summary,
        "cluster_counts": cluster_counts,
        "labels": labels.tolist(),
        "face_assignments": face_assignments,
    }


def default_embeddings_path() -> str:
    """Path to the test embeddings JSON file (for snapshot testing)."""
    return str(Path(settings.notebooks_dir) / settings.embeddings_file)
