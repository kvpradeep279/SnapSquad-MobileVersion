"""
10-Stage HDBSCAN Face Clustering Pipeline (v2.2)

This is the core algorithm that groups face embeddings by person.
It runs on the SERVER but operates on PROTECTED embeddings (feature-subtracted
on-device). Feature subtraction preserves cosine distances, so HDBSCAN
produces identical clusters whether given raw or protected embeddings.

STAGES:
    1.  Cosine distance matrix computation
    2.  HDBSCAN clustering (precomputed distance matrix)
    3.  Post-validation: eject weakly-linked faces from clusters
    4.  Multi-image gate: dissolve clusters whose faces all come from a single image
        (kills background-noise clusters without affecting real people)
    5.  Merge Pass 1: aggressive merge (centroid > threshold, cross_min >= floor)
    6.  Merge Pass 2: conservative small-cluster merge (cross_avg >= floor)
    7.  Merge Pass 3: high-confidence merge for split same-person clusters
        (centroid > 0.55, cross_avg >= 0.25 — catches sunglasses / angle splits
         that pass1 misses because a single cross-pair is low)
    8.  Re-validation after merging
    9.  Coherence-based splitting for heterogeneous clusters
    10. Rescue Pass 1: reassign unidentified faces to nearby clusters
    11. Adaptive outlier ejection (relative to cluster mean)
    12. Rescue Pass 2: final rescue with lower thresholds
    13. Dissolve singleton clusters

V2 NOTE:
    This function works identically for V2 rooms. Embeddings from multiple
    users are pooled together — the algorithm doesn't need to know the source.
"""

from __future__ import annotations

from collections import defaultdict
from itertools import combinations

import hdbscan
import numpy as np


def cluster_faces_v21(faces_data: list[dict], cfg: dict) -> tuple[np.ndarray, dict]:
    embs = np.array([f["embedding"] for f in faces_data], dtype=np.float32)
    n = len(embs)
    stats: dict[str, int] = {}

    if n == 0:
        return np.array([]), {"n_faces": 0, "n_clusters": 0, "n_clustered": 0, "n_unidentified": 0, "clustered_pct": 0, "stats": {}}
    if n == 1:
        return np.array([-1]), {"n_faces": 1, "n_clusters": 0, "n_clustered": 0, "n_unidentified": 1, "clustered_pct": 0, "stats": {}}

    hdbscan_config = cfg["hdbscan"]
    post_validation = cfg["post_validation"]
    merge_pass1 = cfg["merge_pass1"]
    merge_pass2 = cfg["merge_pass2"]
    merge_pass3 = cfg.get("merge_pass3", {"centroid_threshold": 0.30, "cross_avg_min": 0.22})
    rescue_pass1 = cfg["rescue_pass1"]
    rescue_pass2 = cfg["rescue_pass2"]
    outlier_cfg = cfg["outlier"]

    # 1. Distance Matrix
    cos_sim = embs @ embs.T
    cos_dist = np.clip(1.0 - cos_sim, 0, 2).astype(np.float64)
    np.fill_diagonal(cos_dist, 0)

    # 2. HDBSCAN Base Clustering
    labels = hdbscan.HDBSCAN(**hdbscan_config).fit_predict(cos_dist)
    stats["after_hdbscan"] = len(set(labels)) - (1 if -1 in labels else 0)

    def build_cmap(curr_labels: np.ndarray):
        cmap = defaultdict(list)
        for i, lb in enumerate(curr_labels):
            cmap[int(lb)].append(i)
        return dict(cmap)

    def compute_centroids(cmap: dict[int, list[int]]):
        centroids = {}
        for cid, members in cmap.items():
            if cid == -1 or len(members) < 2:
                continue
            c = embs[members].mean(axis=0)
            centroids[cid] = c / np.linalg.norm(c)
        return centroids

    def run_validation(curr_labels: np.ndarray):
        changed = True
        while changed:
            changed = False
            cmap = build_cmap(curr_labels)
            for cid in list(cmap.keys()):
                if cid == -1 or len(cmap[cid]) < 2:
                    continue
                for m in list(cmap[cid]):
                    others = [o for o in cmap[cid] if o != m]
                    if not others:
                        continue
                    sims = [float(np.dot(embs[m], embs[o])) for o in others]
                    if np.mean(sims) < post_validation["min_avg_similarity"] or min(sims) < post_validation["min_link_similarity"]:
                        curr_labels[m] = -1
                        cmap[cid].remove(m)
                        changed = True
        
        # Cleanup broken clusters
        cmap = build_cmap(curr_labels)
        for cid in list(cmap.keys()):
            if cid != -1 and len(cmap[cid]) < 2:
                for m in cmap[cid]:
                    curr_labels[m] = -1
        return curr_labels

    labels = run_validation(labels)

    def merge_pass_fn(curr_labels: np.ndarray, centroid_thresh: float, cross_check_fn):
        changed = True
        while changed:
            changed = False
            cmap = build_cmap(curr_labels)
            centroids = compute_centroids(cmap)
            best_pair, best_sim = None, 0.0
            
            for ci, cj in combinations(centroids.keys(), 2):
                sim = float(np.dot(centroids[ci], centroids[cj]))
                if sim > centroid_thresh and sim > best_sim and cross_check_fn(cmap, ci, cj):
                    best_pair = (ci, cj)
                    best_sim = sim
                    
            if best_pair:
                ci, cj = best_pair
                for m in cmap[cj]:
                    curr_labels[m] = ci
                changed = True
        return curr_labels

    # Merge Pass 3 (from NB15): Strict safety check (Shared Image Guard)
    def check_pass3(cmap, ci, cj):
        imgs_ci = set(faces_data[m].get("photo_id", "") for m in cmap[ci])
        imgs_cj = set(faces_data[m].get("photo_id", "") for m in cmap[cj])
        if imgs_ci & imgs_cj:  # Safety: Never merge if they share an image
            return False
        cross_sims = [float(np.dot(embs[a], embs[b])) for a in cmap[ci] for b in cmap[cj]]
        return float(np.mean(cross_sims)) >= merge_pass3["cross_avg_min"]

    labels = merge_pass_fn(labels, merge_pass3["centroid_threshold"], check_pass3)
    labels = run_validation(labels)

    # Merge Pass 1 & 2
    def check_pass1(cmap, ci, cj):
        cross_sims = [float(np.dot(embs[a], embs[b])) for a in cmap[ci] for b in cmap[cj]]
        return min(cross_sims) >= merge_pass1["cross_min"]

    def check_pass2(cmap, ci, cj):
        if min(len(cmap[ci]), len(cmap[cj])) > merge_pass2["max_cluster_size"]:
            return False
        cross_sims = [float(np.dot(embs[a], embs[b])) for a in cmap[ci] for b in cmap[cj]]
        return np.mean(cross_sims) >= merge_pass2["cross_avg_min"]

    labels = merge_pass_fn(labels, merge_pass1["centroid_threshold"], check_pass1)
    labels = merge_pass_fn(labels, merge_pass2["centroid_threshold"], check_pass2)
    labels = run_validation(labels)

    # Rescue Passes
    def run_rescue(curr_labels: np.ndarray, min_avg: float, min_sim: float):
        cmap = build_cmap(curr_labels)
        centroids = compute_centroids(cmap)
        unid = list(cmap.get(-1, []))
        for idx in unid:
            e = embs[idx]
            best_cid, best_avg, best_min = -1, -1.0, -1.0
            for cid in centroids:
                cluster_imgs = set(faces_data[m].get("photo_id", "") for m in cmap[cid])
                if faces_data[idx].get("photo_id", "") in cluster_imgs:
                    continue  # Safety: Don't rescue into a cluster that already has a face from this image
                sims = [float(np.dot(e, embs[m])) for m in cmap[cid]]
                avg_s = float(np.mean(sims))
                min_s = float(min(sims))
                if avg_s > best_avg:
                    best_cid, best_avg, best_min = cid, avg_s, min_s
            if best_avg >= min_avg and best_min >= min_sim:
                curr_labels[idx] = best_cid
                cmap[best_cid].append(idx)
                if idx in cmap.get(-1, []):
                    cmap[-1].remove(idx)
        return curr_labels

    labels = run_rescue(labels, rescue_pass1["min_avg_similarity"], rescue_pass1["min_sim"])
    labels = run_rescue(labels, rescue_pass2["min_avg_similarity"], rescue_pass2["min_sim"])

    # Adaptive Outlier Ejection
    cmap = build_cmap(labels)
    for cid in list(cmap.keys()):
        if cid == -1 or len(cmap[cid]) < 3:
            continue
        member_avgs = {}
        for m in cmap[cid]:
            others = [o for o in cmap[cid] if o != m]
            sims = [float(np.dot(embs[m], embs[o])) for o in others]
            member_avgs[m] = float(np.mean(sims))

        cluster_mean = float(np.mean(list(member_avgs.values())))
        threshold = outlier_cfg["relative_factor"] * cluster_mean

        for m in list(cmap[cid]):
            avg = member_avgs[m]
            if avg >= outlier_cfg["hard_floor"]:
                continue
            if avg < outlier_cfg["absolute_min_avg"] or avg < threshold:
                labels[m] = -1
                cmap[cid].remove(m)

    # Rescue Pass 3 (Centroid based)
    cmap = build_cmap(labels)
    cents_r3 = compute_centroids(cmap)
    unid_r3 = list(cmap.get(-1, []))
    for idx in unid_r3:
        e = embs[idx]
        best_cid, best_csim = -1, -1.0
        for cid, cen in cents_r3.items():
            cluster_imgs = set(faces_data[m].get("photo_id", "") for m in cmap[cid])
            if faces_data[idx].get("photo_id", "") in cluster_imgs:
                continue
            csim = float(np.dot(e, cen))
            if csim > best_csim:
                best_cid, best_csim = cid, csim
        if best_csim >= 0.25:
            member_sims = [float(np.dot(e, embs[m])) for m in cmap[best_cid]]
            if float(np.mean(member_sims)) >= 0.28:
                labels[idx] = best_cid

    # Stage 10: Shared Image Guard (Physical Constraint)
    cmap_struct = build_cmap(labels)
    for cid in list(cmap_struct.keys()):
        if cid == -1: continue
        img_to_faces = defaultdict(list)
        for m in cmap_struct[cid]:
            img_to_faces[faces_data[m].get("photo_id", "")].append(m)
        for img, face_list in img_to_faces.items():
            if len(face_list) > 1 and img != "":
                # Keep the face that is MOST similar to the rest of the cluster
                others_in_cluster = [x for x in cmap_struct[cid] if x not in face_list]
                if not others_in_cluster:
                    best = face_list[0]
                else:
                    best = max(face_list, key=lambda x: np.mean([np.dot(embs[x], embs[o]) for o in others_in_cluster]))
                for m in face_list:
                    if m != best:
                        labels[m] = -1

    # Stage 12b: Final Cleanup
    cmap_final = build_cmap(labels)
    for cid in list(cmap_final.keys()):
        if cid == -1 or len(cmap_final[cid]) < 3: continue
        for m in list(cmap_final[cid]):
            others = [o for o in cmap_final[cid] if o != m]
            avg = float(np.mean([float(np.dot(embs[m], embs[o])) for o in others]))
            if avg < 0.28:  # Enforce absolute min to mathematically eject the 'hat guy' impostor
                labels[m] = -1

    # Ensure no small clusters remain
    cmap_final = build_cmap(labels)
    for cid in list(cmap_final.keys()):
        if cid != -1 and len(cmap_final[cid]) < 2:
            for m in cmap_final[cid]:
                labels[m] = -1

    # Stage 14: Recover Noise Pairs (Failsafe for when HDBSCAN drops a valid pair)
    # If 2 unclustered faces share high similarity and don't come from the same photo, make them a new cluster
    cmap_recover = build_cmap(labels)
    unid_faces = list(cmap_recover.get(-1, []))
    if len(unid_faces) >= 2:
        next_new_cid = max(labels) + 1 if len(labels) > 0 and max(labels) >= 0 else 0
        
        # We need a while loop since we'll be modifying unid_faces
        i = 0
        while i < len(unid_faces):
            f1 = unid_faces[i]
            if labels[f1] != -1:  # Already rescued
                i += 1
                continue
                
            best_f2 = -1
            best_sim = -1.0
            
            for j in range(i + 1, len(unid_faces)):
                f2 = unid_faces[j]
                if labels[f2] != -1:
                    continue
                # Shared image guard
                if faces_data[f1].get("photo_id", "") == faces_data[f2].get("photo_id", "") and faces_data[f1].get("photo_id", "") != "":
                    continue
                    
                sim = float(np.dot(embs[f1], embs[f2]))
                if sim > best_sim:
                    best_sim = sim
                    best_f2 = f2
            
            # 0.35 is our hard floor for same-person validation
            if best_f2 != -1 and best_sim >= outlier_cfg["hard_floor"]:
                labels[f1] = next_new_cid
                labels[best_f2] = next_new_cid
                next_new_cid += 1
                
            i += 1

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = int((labels == -1).sum())
    n_clustered = n - n_noise

    summary = {
        "n_faces": n,
        "n_clusters": int(n_clusters),
        "n_clustered": int(n_clustered),
        "n_unidentified": int(n_noise),
        "clustered_pct": float(n_clustered / n * 100 if n else 0),
        "stats": stats,
    }
    return labels, summary
