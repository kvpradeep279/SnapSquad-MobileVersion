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

        # Smart fallback: if all faces come from a single unique photo,
        # HDBSCAN cannot meaningfully cluster (each face appears only once).
        # In that case, treat every face as its own unique person.
        unique_photo_ids = {d["photo_id"] for d in embedding_dicts}
        
        if len(unique_photo_ids) == 1:
            # Single photo: assign each face its own cluster label (0, 1, 2, ...)
            import numpy as np
            labels_list = list(range(len(embedding_dicts)))
            cluster_counts = {i: 1 for i in labels_list}
            output = {
                "labels": labels_list,
                "cluster_counts": cluster_counts,
                "summary": {
                    "n_faces": len(embedding_dicts),
                    "n_clusters": len(embedding_dicts),
                    "n_clustered": len(embedding_dicts),
                    "n_unidentified": 0,
                    "clustered_pct": 100.0,
                    "stats": {"single_photo_fallback": True},
                },
                "face_assignments": [
                    {"photo_id": d["photo_id"], "face_index": d["face_index"], "cluster_label": i}
                    for i, d in enumerate(embedding_dicts)
                ],
            }
        else:
            output = run_pipeline_on_embeddings(embedding_dicts)

        # ── Promote orphaned faces to their own clusters ──────────
        # Any face HDBSCAN couldn't group (label == -1) gets promoted
        # to a unique cluster instead of being stuck in "Unidentified."
        # This ensures every person in a photo gets their own slot,
        # even if they only appear once across the entire album.
        labels_list = output["labels"]
        cluster_counts = dict(output["cluster_counts"])
        
        if -1 in cluster_counts:
            next_label = max((k for k in cluster_counts if k != -1), default=-1) + 1
            promoted = 0
            for i, lbl in enumerate(labels_list):
                if lbl == -1:
                    labels_list[i] = next_label
                    cluster_counts[next_label] = 1
                    next_label += 1
                    promoted += 1
            del cluster_counts[-1]
            output["labels"] = labels_list
            output["cluster_counts"] = cluster_counts

        # ── Stage 4: Write cluster labels back to face_detections ─
        job.stage = "saving_results"
        db.commit()

        labels = output["labels"]
        for i, fd in enumerate(face_dets):
            fd.cluster_label = int(labels[i])

        # ── Stage 5: Rebuild Cluster summary table ────────────────
        db.execute(delete(Cluster).where(Cluster.album_id == album_id))

        from app.models.global_identity import GlobalIdentity
        import numpy as np

        global_ids = db.query(GlobalIdentity).filter(GlobalIdentity.user_id == album.user_id).all()
        # Pre-parse embeddings for quick matching
        global_memory = []
        for gid in global_ids:
            try:
                emb = np.array(json.loads(gid.embedding_json))
                global_memory.append({"name": gid.name, "embedding": emb})
            except Exception:
                pass

        for label, count in output["cluster_counts"].items():
            if int(label) == -1:
                continue
                
            display_name = f"Person {label}"
            
            # --- Auto-Tagging Check ---
            if global_memory:
                # Find faces in this cluster
                cluster_faces = [fd for i, fd in enumerate(face_dets) if int(labels[i]) == int(label)]
                if cluster_faces:
                    # Compute cluster centroid
                    c_embeddings = [json.loads(fd.embedding_json) for fd in cluster_faces]
                    centroid = np.mean(c_embeddings, axis=0)
                    centroid = centroid / (np.linalg.norm(centroid) + 1e-10)
                    
                    # Find best match
                    best_match = None
                    best_sim = -1
                    for gm in global_memory:
                        sim = np.dot(centroid, gm["embedding"])
                        if sim > best_sim:
                            best_sim = sim
                            best_match = gm["name"]
                            
                    # If similarity is very high, auto-tag it!
                    if best_sim > 0.85 and best_match:
                        display_name = best_match
            # --------------------------

            db.add(Cluster(
                album_id=album_id,
                cluster_label=int(label),
                display_name=display_name,
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
