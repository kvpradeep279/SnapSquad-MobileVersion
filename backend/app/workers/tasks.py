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

            # Find all face_detections in this cluster to compute centroid
            cluster_faces = [
                fd for i, fd in enumerate(face_dets)
                if int(labels[i]) == int(label)
            ]

            # Compute L2-normalised centroid for this cluster.
            # Stored so that the /find-me endpoint can match against it
            # efficiently without a full pgvector scan.
            centroid_json = ""
            centroid_vec = None
            if cluster_faces:
                try:
                    c_embs = np.array(
                        [json.loads(fd.embedding_json) for fd in cluster_faces],
                        dtype=np.float32,
                    )
                    centroid_vec = np.mean(c_embs, axis=0)
                    norm = np.linalg.norm(centroid_vec)
                    if norm > 1e-10:
                        centroid_vec = centroid_vec / norm
                    centroid_json = json.dumps(centroid_vec.tolist())
                except Exception:
                    centroid_json = ""
                    centroid_vec = None

            # --- Auto-Tagging Check ---
            if global_memory and centroid_vec is not None:
                best_match = None
                best_sim = -1.0
                for gm in global_memory:
                    sim = float(np.dot(centroid_vec, gm["embedding"]))
                    if sim > best_sim:
                        best_sim = sim
                        best_match = gm["name"]
                if best_sim > 0.55 and best_match:
                    display_name = best_match
            # --------------------------

            db.add(Cluster(
                album_id=album_id,
                cluster_label=int(label),
                display_name=display_name,
                face_count=int(count),
                centroid_json=centroid_json,
            ))

        # ── Stage 6: Save full JSON output to local store ────────
        output_path = store.write_json(album_id, "clusters.json", output)
        album.output_json = output_path
        album.status = "complete"
        album.total_faces = len(output["cluster_counts"])
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


def process_room_upload_job(
    job_id: str,
    room_id: str,
    album_id: str,
    photo_ids: list,
    uploader_id: str,
) -> None:
    """Process a room member's uploaded photos through the clustering pipeline.

    Called by the RQ worker (or synchronously in dev mode).

    TWO PATHS depending on whether clusters already exist for this room:

    PATH A — No existing clusters (first upload):
        Run full HDBSCAN on ALL embeddings in the shadow album.
        Store centroid_json per cluster for future incremental use.

    PATH B — Existing clusters (late joiner / subsequent upload):
        Use incremental clustering (services/clustering/incremental_cluster.py).
        Compare only the NEW batch embeddings against stored centroids.
        Assign to existing cluster (sim >= 0.72) or create new cluster.
        Update centroids as running averages — no HDBSCAN re-run needed.

    Steps (both paths):
        1. Mark job as processing
        2. Load face embeddings
        3A. Full HDBSCAN (first upload) OR 3B. Incremental (subsequent)
        4. Write cluster labels back to face_detections
        5. Rebuild / update Cluster table with centroid_json
        6. Mark album + job as complete
        7. Self-re-trigger if new photos arrived during processing
    """
    import numpy as np

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

        # ── Stage 2: Load ALL room embeddings ────────────────────
        # Load all faces from the shadow album (not just this uploader's batch)
        # so HDBSCAN can group the same person across all members' photos.
        face_dets = (
            db.query(FaceDetection)
            .filter(FaceDetection.album_id == album_id)
            .order_by(FaceDetection.created_at.asc())
            .all()
        )

        if not face_dets:
            job.status = "complete"
            job.stage = "no_faces"
            album.status = "complete"
            db.commit()
            return

        # Build embedding dicts — skip low-confidence detections
        embedding_dicts = []
        valid_face_dets = []
        for fd in face_dets:
            if fd.det_score is not None and fd.det_score < 0.6:
                continue  # Skip blurry / low-confidence faces
            try:
                emb = json.loads(fd.embedding_json) if fd.embedding_json else None
            except Exception:
                emb = None
            if not emb:
                continue
            embedding_dicts.append({
                "photo_id": fd.photo_id,
                "face_index": fd.face_index,
                "bbox": [int(v) for v in fd.bbox.split(",")] if fd.bbox else [0, 0, 0, 0],
                "det_score": fd.det_score or 1.0,
                "embedding": emb,
            })
            valid_face_dets.append(fd)

        if not embedding_dicts:
            job.status = "complete"
            job.stage = "no_valid_faces"
            album.status = "complete"
            db.commit()
            return

        # ── Stage 3: Incremental OR Full HDBSCAN ─────────────────
        job.stage = "clustering"
        db.commit()

        # Check if clusters already exist for this room's shadow album
        existing_clusters = (
            db.query(Cluster)
            .filter(Cluster.album_id == album_id)
            .all()
        )
        # Use incremental when: clusters exist AND a specific batch of
        # photo_ids was provided (i.e., triggered by a member upload).
        # Fall back to full HDBSCAN for manual re-triggers (photo_ids=[]).
        use_incremental = len(existing_clusters) > 0 and bool(photo_ids)

        if use_incremental:
            # ── PATH B: Incremental clustering ────────────────────
            from app.services.clustering.incremental_cluster import (
                assign_to_existing_clusters,
            )
            batch_photo_set = set(photo_ids)
            batch_face_dets = [fd for fd in valid_face_dets if fd.photo_id in batch_photo_set]
            new_face_embeddings = [
                {
                    "face_det_id": fd.id,
                    "embedding": json.loads(fd.embedding_json),
                    "det_score": fd.det_score or 1.0,
                }
                for fd in batch_face_dets
                if fd.embedding_json
            ]

            assignments, _updated, new_cluster_objects = assign_to_existing_clusters(
                new_face_embeddings=new_face_embeddings,
                existing_clusters=existing_clusters,
                album_id=album_id,
            )

            # Write cluster labels back for this batch's faces
            assignment_map = {a["face_det_id"]: a for a in assignments}
            for fd in batch_face_dets:
                if fd.id in assignment_map:
                    fd.cluster_label = assignment_map[fd.id]["cluster_label"]

            for nc in new_cluster_objects:
                db.add(nc)

        else:
            # ── PATH A: Full HDBSCAN (first upload / manual re-trigger) ──
            # If all faces come from a single photo or there is only 1 face,
            # HDBSCAN cannot run. Treat each face as its own unique person.
            unique_photo_ids = {d["photo_id"] for d in embedding_dicts}
            if len(unique_photo_ids) == 1 or len(embedding_dicts) < 2:
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

            # Promote orphaned faces (label -1) to solo clusters
            labels_list = output["labels"]
            cluster_counts = dict(output["cluster_counts"])
            if -1 in cluster_counts:
                next_label = max((k for k in cluster_counts if k != -1), default=-1) + 1
                for i, lbl in enumerate(labels_list):
                    if lbl == -1:
                        labels_list[i] = next_label
                        cluster_counts[next_label] = 1
                        next_label += 1
                del cluster_counts[-1]
                output["labels"] = labels_list
                output["cluster_counts"] = cluster_counts

            job.stage = "saving_results"
            db.commit()

            labels = output["labels"]
            for i, fd in enumerate(valid_face_dets):
                fd.cluster_label = int(labels[i])

            # Rebuild Cluster table with centroid_json
            db.execute(delete(Cluster).where(Cluster.album_id == album_id))
            for label, count in cluster_counts.items():
                if int(label) == -1:
                    continue
                cluster_faces = [
                    valid_face_dets[i]
                    for i, lbl in enumerate(labels)
                    if int(lbl) == int(label)
                ]
                centroid_json = ""
                if cluster_faces:
                    try:
                        c_embs = np.array(
                            [json.loads(fd.embedding_json) for fd in cluster_faces],
                            dtype=np.float32,
                        )
                        centroid = np.mean(c_embs, axis=0)
                        norm = np.linalg.norm(centroid)
                        if norm > 1e-10:
                            centroid = centroid / norm
                        centroid_json = json.dumps(centroid.tolist())
                    except Exception:
                        centroid_json = ""
                db.add(Cluster(
                    album_id=album_id,
                    cluster_label=int(label),
                    display_name=f"Person {label}",
                    face_count=int(count),
                    centroid_json=centroid_json,
                ))

        # ── Mark complete ─────────────────────────────────────────
        album.status = "complete"
        job.status = "complete"
        job.stage = "complete"
        db.commit()


        # ── Stage 7: Self-re-trigger if new photos arrived ────────
        # Check if any face_detections were added to this album AFTER
        # this job started (i.e., another member uploaded concurrently).
        new_face_count = (
            db.query(FaceDetection)
            .filter(FaceDetection.album_id == album_id)
            .count()
        )
        if new_face_count > len(face_dets):
            # New faces arrived during clustering — re-trigger
            from app.models.room import Room
            room = db.query(Room).filter(Room.shadow_album_id == album_id).first()
            if room:
                new_job = PipelineJob(
                    album_id=album_id,
                    room_id=room.id,
                    uploader_id="auto-retrigger",
                    status="queued",
                    stage="queued",
                )
                db.add(new_job)
                album.status = "clustering"
                db.commit()
                try:
                    from app.workers.queue import get_queue
                    rq_job = get_queue().enqueue(
                        "app.workers.tasks.process_room_upload_job",
                        new_job.id,
                        room.id,
                        album_id,
                        [],
                        "auto-retrigger",
                    )
                    new_job.rq_job_id = rq_job.id
                    db.commit()
                except Exception:
                    # Dev mode: run sync
                    process_room_upload_job(
                        new_job.id, room.id, album_id, [], "auto-retrigger"
                    )

    except Exception as exc:
        db.rollback()
        try:
            job_record = db.get(PipelineJob, job_id)
            if job_record:
                job_record.status = "failed"
                job_record.stage = f"error: {str(exc)[:200]}"
            album_record = db.get(Album, album_id)
            if album_record:
                album_record.status = "failed"
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


def cleanup_expired_rooms() -> None:
    """
    Scheduled background task to cleanup expired event rooms.
    Should be run via Celery Beat or cron.
    """
    import logging
    from datetime import datetime, timezone
    from app.models.room import Room

    db = SessionLocal()
    logger = logging.getLogger(__name__)
    
    try:
        now = datetime.now(timezone.utc)
        # Find rooms that have expired but are not yet marked as expired
        expired_rooms = db.query(Room).filter(
            Room.expires_at < now,
            Room.status != "expired"
        ).all()
        
        for room in expired_rooms:
            logger.info(f"Marking room {room.id} as expired")
            room.status = "expired"
            # Future expansion: Actually delete S3 blobs to save storage
        
        db.commit()
        logger.info(f"Cleaned up {len(expired_rooms)} expired rooms.")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to cleanup expired rooms: {e}")
    finally:
        db.close()

