"""
Incremental clustering — assign new face embeddings to existing room clusters.

Used in Phase 3 of V2 when a late-joiner uploads photos to a room that already
has clusters from previous uploads. Instead of running full HDBSCAN again on
the entire album, we compare each new embedding against the stored cluster
centroids and either assign it to the best matching cluster or create a new one.

ALGORITHM:
    For each new face embedding:
        1. Compute cosine similarity against every existing cluster centroid
        2. If best_sim >= THRESHOLD (0.72) → assign to that cluster
           Update centroid as running average: (old * n + new) / (n + 1)
        3. If best_sim < THRESHOLD for all clusters → new person → new cluster

THRESHOLD = 0.72 rationale:
    - MobileFaceNet 192D L2-normalised embeddings
    - Same person (different lighting/pose): cosine sim ≈ 0.75–0.90
    - Different people: cosine sim ≈ 0.30–0.55
    - 0.72 sits safely in the gap, preventing both fragmentation and false merges

WHEN TO USE INCREMENTAL vs FULL HDBSCAN:
    - First upload to a room (no clusters yet) → Full HDBSCAN (process_room_upload_job)
    - Subsequent uploads (clusters already exist) → Incremental (this module)
    - Manual re-trigger (POST /rooms/{id}/process) → Full HDBSCAN to re-cluster cleanly

INPUTS:
    new_embeddings: list of {"face_det_id": str, "embedding": List[float], "det_score": float}
    existing_clusters: list of Cluster ORM objects (must have centroid_json + face_count)

OUTPUTS:
    assignments: list of {"face_det_id": str, "cluster_id": str, "is_new_cluster": bool}
    updated_clusters: list of modified Cluster objects (not yet committed)
    new_clusters: list of new Cluster objects to db.add() (not yet committed)
"""

from __future__ import annotations

import json
import uuid
from typing import Optional

import numpy as np

STRICT_THRESHOLD = 0.65       # Strict cosine similarity cutoff for clear same-person match
MODERATE_THRESHOLD = 0.55     # Moderate cutoff for same-person (handles bad lighting/angles)
HIGH_CONFIDENCE_DET_SCORE = 0.85 # Minimum detection score required to trust a moderate match
MIN_DET_SCORE = 0.6           # skip blurry / low-confidence faces


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def assign_to_existing_clusters(
    new_face_embeddings: list[dict],
    existing_clusters: list,       # List[Cluster ORM objects]
    album_id: str,
) -> tuple[list[dict], list, list]:
    """Assign new face embeddings to existing clusters or create new ones.

    Args:
        new_face_embeddings:
            List of dicts: {"face_det_id": str, "embedding": list[float], "det_score": float}
        existing_clusters:
            SQLAlchemy Cluster ORM objects already in the room.
            Must have: id, centroid_json (JSON str), face_count, cluster_label.
        album_id:
            The shadow album ID — used when creating new Cluster objects.
        threshold:
            Cosine similarity cutoff. Default 0.72.

    Returns:
        (assignments, updated_clusters, new_cluster_objects)
        - assignments: [{"face_det_id": str, "cluster_id": str, "is_new_cluster": bool}]
        - updated_clusters: Cluster objects whose centroid/face_count changed (same ORM refs)
        - new_cluster_objects: new Cluster objects to db.add()
    """
    from app.models.cluster import Cluster

    # Parse all existing centroids up front (skip clusters with empty/invalid centroids)
    cluster_state: list[dict] = []
    for c in existing_clusters:
        centroid = _parse_centroid(c.centroid_json)
        if centroid is not None:
            cluster_state.append({
                "cluster": c,
                "centroid": centroid,
                "face_count": c.face_count,
            })

    assignments: list[dict] = []
    updated_set: set[str] = set()   # cluster IDs that were modified
    new_cluster_objects: list = []

    # Determine next available cluster_label (for new clusters)
    all_labels = [c.cluster_label for c in existing_clusters]
    next_label = (max(all_labels) + 1) if all_labels else 0

    for face in new_face_embeddings:
        face_det_id = face["face_det_id"]
        det_score = face.get("det_score", 1.0)

        # Skip low-confidence detections
        if det_score < MIN_DET_SCORE:
            continue

        try:
            embedding = np.array(face["embedding"], dtype=np.float32)
        except Exception:
            continue

        # L2-normalise the incoming embedding
        norm = np.linalg.norm(embedding)
        if norm < 1e-10:
            continue
        embedding = embedding / norm

        # Find best matching cluster
        best_sim = -1.0
        best_idx: Optional[int] = None
        for idx, cs in enumerate(cluster_state):
            sim = float(np.dot(embedding, cs["centroid"]))
            if sim > best_sim:
                best_sim = sim
                best_idx = idx

        # Multi-Pass Evaluation
        is_match = False
        if best_idx is not None:
            if best_sim >= STRICT_THRESHOLD:
                is_match = True
            elif best_sim >= MODERATE_THRESHOLD and det_score >= HIGH_CONFIDENCE_DET_SCORE:
                is_match = True

        if is_match and best_idx is not None:
            # ── Assign to existing cluster ────────────────────────
            cs = cluster_state[best_idx]
            cluster_obj = cs["cluster"]

            # Update running-average centroid
            n = cs["face_count"]
            new_centroid = (cs["centroid"] * n + embedding) / (n + 1)
            new_norm = np.linalg.norm(new_centroid)
            if new_norm > 1e-10:
                new_centroid = new_centroid / new_norm

            cs["centroid"] = new_centroid
            cs["face_count"] = n + 1

            # Write back to ORM object
            cluster_obj.centroid_json = json.dumps(new_centroid.tolist())
            cluster_obj.face_count = n + 1
            updated_set.add(cluster_obj.id)

            assignments.append({
                "face_det_id": face_det_id,
                "cluster_id": cluster_obj.id,
                "cluster_label": cluster_obj.cluster_label,
                "similarity": round(best_sim, 4),
                "is_new_cluster": False,
            })

        else:
            # ── New person → create new cluster ──────────────────
            new_cluster = Cluster(
                id=str(uuid.uuid4()),
                album_id=album_id,
                cluster_label=next_label,
                display_name=f"Person {next_label}",
                face_count=1,
                centroid_json=json.dumps(embedding.tolist()),
            )
            next_label += 1
            new_cluster_objects.append(new_cluster)

            # Add to cluster_state so subsequent faces in this batch
            # can match against newly created clusters
            cluster_state.append({
                "cluster": new_cluster,
                "centroid": embedding.copy(),
                "face_count": 1,
            })

            assignments.append({
                "face_det_id": face_det_id,
                "cluster_id": new_cluster.id,
                "cluster_label": new_cluster.cluster_label,
                "similarity": round(best_sim, 4),
                "is_new_cluster": True,
            })

    # Collect only the actually-modified existing clusters
    updated_clusters = [
        cs["cluster"]
        for cs in cluster_state
        if cs["cluster"].id in updated_set
    ]

    return assignments, updated_clusters, new_cluster_objects


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_centroid(centroid_json: str) -> Optional[np.ndarray]:
    """Parse centroid_json string into a normalised numpy array.

    Returns None if the string is empty, malformed, or zero-norm.
    """
    if not centroid_json:
        return None
    try:
        vec = np.array(json.loads(centroid_json), dtype=np.float32)
    except Exception:
        return None
    norm = np.linalg.norm(vec)
    if norm < 1e-10:
        return None
    return vec / norm


def compute_centroid(embeddings: list[list[float]]) -> str:
    """Compute an L2-normalised mean centroid from a list of embeddings.

    Returns a JSON string ready to store in Cluster.centroid_json.
    Returns "" if the list is empty or computation fails.
    """
    if not embeddings:
        return ""
    try:
        mat = np.array(embeddings, dtype=np.float32)
        centroid = np.mean(mat, axis=0)
        norm = np.linalg.norm(centroid)
        if norm > 1e-10:
            centroid = centroid / norm
        return json.dumps(centroid.tolist())
    except Exception:
        return ""


def update_centroid(
    old_centroid_json: str,
    old_count: int,
    new_embedding: list[float],
) -> str:
    """Running-average centroid update when one new embedding is added.

    new_centroid = (old_centroid * n + new_embedding) / (n + 1), then L2-normalised.
    Returns a JSON string ready to store in Cluster.centroid_json.
    """
    old = _parse_centroid(old_centroid_json)
    if old is None:
        # No prior centroid — just normalise the new embedding
        return compute_centroid([new_embedding])
    try:
        new_emb = np.array(new_embedding, dtype=np.float32)
        updated = (old * old_count + new_emb) / (old_count + 1)
        norm = np.linalg.norm(updated)
        if norm > 1e-10:
            updated = updated / norm
        return json.dumps(updated.tolist())
    except Exception:
        return old_centroid_json  # fallback: keep old centroid
