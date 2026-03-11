"""
Background task — HDBSCAN clustering on protected embeddings.

This is the actual worker function that runs when the RQ job is dequeued.
It loads all protected embeddings from the database, runs the 10-stage
HDBSCAN clustering pipeline, and writes results back.

ARCHITECTURE:
    - Input: Protected 512-d embeddings from face_detections table
    - Processing: cluster_faces_v21() — HDBSCAN + validation/merge/rescue/split
    - Output: cluster_label assigned to each face_detection row + Cluster table updated

    Zero ML models involved. Just cosine distance matrix + HDBSCAN (pure math).
"""

import json

from sqlalchemy import delete

from app.db.session import SessionLocal
from app.models.album import Album
from app.models.cluster import Cluster
from app.models.face_detection import FaceDetection
from app.models.job import PipelineJob
from app.services.pipeline.service import run_pipeline_on_embeddings
from app.services.storage.local_store import LocalStore


def process_album_job(job_id: str, album_id: str) -> None:
    """Process an album's face embeddings through the clustering pipeline.

    Called by the RQ worker. Runs in a separate process from FastAPI.

    Steps:
        1. Load all protected embeddings from face_detections table
        2. Run the 10-stage HDBSCAN clustering pipeline
        3. Update face_detections with cluster labels
        4. Create Cluster summary records
        5. Save full output JSON to local store
        6. Update album and job status to 'complete'
    """
    db = SessionLocal()
    store = LocalStore()

    try:
        job = db.get(PipelineJob, job_id)
        album = db.get(Album, album_id)
        if not job or not album:
            return

        # ── Stage 1: Mark as processing ──────────────────────────
        job.status = "processing"
        job.stage = "loading_embeddings"
        album.status = "clustering"
        db.commit()

        # ── Stage 2: Load embeddings from database ───────────────
        face_dets = (
            db.query(FaceDetection)
            .filter(FaceDetection.album_id == album_id)
            .order_by(FaceDetection.created_at.asc())
            .all()
        )

        if not face_dets:
            job.status = "failed"
            job.stage = "no_faces"
            album.status = "failed"
            db.commit()
            return

        # Build embedding dicts for the pipeline
        embedding_dicts = []
        for fd in face_dets:
            embedding_dicts.append({
                "photo_id": fd.photo_id,
                "face_index": fd.face_index,
                "bbox": [int(v) for v in fd.bbox.split(",")],
                "det_score": fd.det_score,
                "embedding": json.loads(fd.embedding_json),
            })

        # ── Stage 3: Run HDBSCAN clustering ──────────────────────
        job.stage = "clustering"
        db.commit()

        output = run_pipeline_on_embeddings(embedding_dicts)

        # ── Stage 4: Write cluster labels back to face_detections ─
        job.stage = "saving_results"
        db.commit()

        labels = output["labels"]
        for i, fd in enumerate(face_dets):
            fd.cluster_label = int(labels[i])

        # ── Stage 5: Rebuild Cluster summary table ────────────────
        db.execute(delete(Cluster).where(Cluster.album_id == album_id))

        for label, count in output["cluster_counts"].items():
            if int(label) == -1:
                continue
            db.add(Cluster(
                album_id=album_id,
                cluster_label=int(label),
                display_name=f"Person {label}",
                face_count=int(count),
            ))

        # ── Stage 6: Save full JSON output to local store ────────
        output_path = store.write_json(album_id, "clusters.json", output)
        album.output_json = output_path
        album.status = "complete"
        job.status = "complete"
        job.stage = "complete"
        db.commit()

    except Exception as exc:
        # Mark as failed without losing the error info
        db.rollback()
        try:
            job_record = db.get(PipelineJob, job_id)
            if job_record:
                job_record.status = "failed"
                job_record.stage = "error"
            album_record = db.get(Album, album_id)
            if album_record:
                album_record.status = "failed"
            db.commit()
            store.write_json(album_id, "error.json", {"error": str(exc)})
        except Exception:
            pass  # Don't mask the original error
    finally:
        db.close()
