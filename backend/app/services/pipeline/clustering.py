"""
10-Stage HDBSCAN Face Clustering Pipeline (v2.1)

This is the core algorithm that groups face embeddings by person.
It runs on the SERVER but operates on PROTECTED embeddings (feature-subtracted
on-device). Feature subtraction preserves cosine distances, so HDBSCAN
produces identical clusters whether given raw or protected embeddings.

STAGES:
    1. Cosine distance matrix computation
    2. HDBSCAN clustering (precomputed distance matrix)
    3. Post-validation: eject weakly-linked faces from clusters
    4. Merge Pass 1: aggressive merge (centroid > 0.50, cross_min >= 0.15)
    5. Merge Pass 2: conservative merge (centroid > 0.39, cross_avg >= 0.25, size <= 3)
    6. Re-validation after merging
    7. Coherence-based splitting for heterogeneous clusters
    8. Rescue Pass 1: reassign unidentified faces to nearby clusters
    9. Adaptive outlier ejection (relative to cluster mean)
    10. Rescue Pass 2: final rescue with lower thresholds

All thresholds are tuned from Notebook 3 & 4 experiments.
Produces 10 clusters from 107 test faces with 74.8% clustering rate.

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

    hdbscan_config = cfg["hdbscan"]
    post_validation = cfg["post_validation"]
    merge_pass1 = cfg["merge_pass1"]
    merge_pass2 = cfg["merge_pass2"]
    rescue_pass1 = cfg["rescue_pass1"]
    rescue_pass2 = cfg["rescue_pass2"]
    outlier_cfg = cfg["outlier"]
    coherence = cfg["coherence_split"]

    cos_sim = embs @ embs.T
    cos_dist = np.clip(1.0 - cos_sim, 0, 2).astype(np.float64)
    np.fill_diagonal(cos_dist, 0)

    labels = hdbscan.HDBSCAN(**hdbscan_config).fit_predict(cos_dist)
    stats["after_hdbscan"] = len(set(labels)) - (1 if -1 in labels else 0)

    def build_cmap(curr_labels: np.ndarray):
        cmap = defaultdict(list)
        for i, lb in enumerate(curr_labels):
            cmap[int(lb)].append(i)
        return cmap

    def compute_centroids(cmap: dict[int, list[int]]):
        centroids = {}
        for cid, members in cmap.items():
            if cid == -1 or len(members) < 2:
                continue
            c = embs[members].mean(axis=0)
            centroids[cid] = c / np.linalg.norm(c)
        return centroids

    def run_validation(curr_labels: np.ndarray):
        ejected = 0
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
                        ejected += 1
                        changed = True
        cmap = build_cmap(curr_labels)
        for cid in list(cmap.keys()):
            if cid != -1 and len(cmap[cid]) < 2:
                for m in cmap[cid]:
                    curr_labels[m] = -1
        return curr_labels, ejected

    labels, ejected_s3 = run_validation(labels)
    stats["ejected_stage3"] = ejected_s3

    def merge_pass_fn(curr_labels: np.ndarray, centroid_thresh: float, cross_check_fn):
        merged = 0
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
                merged += 1
                changed = True
        return curr_labels, merged

    def check_pass1(cmap, ci, cj):
        cross_sims = [float(np.dot(embs[a], embs[b])) for a in cmap[ci] for b in cmap[cj]]
        return min(cross_sims) >= merge_pass1["cross_min"]

    labels, merged1 = merge_pass_fn(labels, merge_pass1["centroid_threshold"], check_pass1)

    def check_pass2(cmap, ci, cj):
        if min(len(cmap[ci]), len(cmap[cj])) > merge_pass2["max_cluster_size"]:
            return False
        cross_sims = [float(np.dot(embs[a], embs[b])) for a in cmap[ci] for b in cmap[cj]]
        return np.mean(cross_sims) >= merge_pass2["cross_avg_min"]

    labels, merged2 = merge_pass_fn(labels, merge_pass2["centroid_threshold"], check_pass2)
    stats["merged_pass1"] = merged1
    stats["merged_pass2"] = merged2

    labels, ejected_s5 = run_validation(labels)
    stats["ejected_stage5"] = ejected_s5

    def run_rescue(curr_labels: np.ndarray, min_avg: float, min_sim: float):
        rescued = 0
        cmap = build_cmap(curr_labels)
        centroids = compute_centroids(cmap)
        unid = list(cmap.get(-1, []))
        for idx in unid:
            e = embs[idx]
            best_cid, best_avg, best_min = -1, -1.0, -1.0
            for cid in centroids:
                sims = [float(np.dot(e, embs[m])) for m in cmap[cid]]
                avg_s = float(np.mean(sims))
                min_s = float(min(sims))
                if avg_s > best_avg:
                    best_cid, best_avg, best_min = cid, avg_s, min_s
            if best_avg >= min_avg and best_min >= min_sim:
                curr_labels[idx] = best_cid
                rescued += 1
        return curr_labels, rescued

    labels, rescued1 = run_rescue(labels, rescue_pass1["min_avg_similarity"], rescue_pass1["min_sim"])
    stats["rescued_pass1"] = rescued1

    min_cs = coherence["min_cluster_size"]
    split_sim = coherence["split_sim"]
    cross_thresh = coherence["cross_threshold"]
    splits_done = 0

    cmap = build_cmap(labels)
    next_id = max(cmap.keys()) + 1 if cmap else 0

    for cid in list(cmap.keys()):
        if cid == -1 or len(cmap[cid]) < min_cs:
            continue
        members = cmap[cid]
        n_m = len(members)

        int_sim = np.zeros((n_m, n_m), dtype=np.float64)
        for i in range(n_m):
            for j in range(n_m):
                int_sim[i, j] = float(np.dot(embs[members[i]], embs[members[j]]))

        avg_per = [np.mean([int_sim[i, j] for j in range(n_m) if j != i]) for i in range(n_m)]
        worst_i = int(np.argmin(avg_per))

        group_weak = [members[i] for i in range(n_m) if int_sim[worst_i, i] >= split_sim]
        group_strong = [members[i] for i in range(n_m) if int_sim[worst_i, i] < split_sim]

        if len(group_weak) < 2 or len(group_strong) < 2:
            continue

        cross_sims = [float(np.dot(embs[a], embs[b])) for a in group_weak for b in group_strong]
        cross_avg = float(np.mean(cross_sims))

        if cross_avg < cross_thresh:
            if len(group_weak) <= len(group_strong):
                small_group = group_weak
            else:
                small_group = group_strong
            for m in small_group:
                labels[m] = next_id
            next_id += 1
            splits_done += 1
            cmap = build_cmap(labels)

    stats["splits"] = splits_done

    labels, rescued2 = run_rescue(labels, rescue_pass2["min_avg_similarity"], rescue_pass2["min_sim"])
    stats["rescued_pass2"] = rescued2

    rel_factor = outlier_cfg["relative_factor"]
    hard_floor = outlier_cfg["hard_floor"]
    abs_min = outlier_cfg["absolute_min_avg"]
    adaptive_ejected = 0

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
        threshold = rel_factor * cluster_mean

        for m in list(cmap[cid]):
            avg = member_avgs[m]
            if avg >= hard_floor:
                continue
            if avg < abs_min or avg < threshold:
                labels[m] = -1
                adaptive_ejected += 1

    stats["adaptive_ejected"] = adaptive_ejected

    cmap = build_cmap(labels)
    dissolved = 0
    for cid in list(cmap.keys()):
        if cid != -1 and len(cmap[cid]) < 2:
            for m in cmap[cid]:
                labels[m] = -1
            dissolved += len(cmap[cid])
    stats["dissolved"] = dissolved

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
