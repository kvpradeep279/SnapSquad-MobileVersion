# SnapSquad Pipeline Config (Notebook 15 Architecture)

HDBSCAN_CONFIG = {
    "min_cluster_size": 2,
    "min_samples": 1,
    "metric": "precomputed",
    "cluster_selection_epsilon": 0.30,
}

POST_VALIDATION = {
    "min_avg_similarity": 0.28,
    "min_link_similarity": 0.20,
}

MERGE_PASS1 = {
    "centroid_threshold": 0.50,
    "cross_min": 0.15,
}

MERGE_PASS2 = {
    "centroid_threshold": 0.39,
    "cross_avg_min": 0.25,
    "max_cluster_size": 3,
}

MERGE_PASS3 = {
    "centroid_threshold": 0.30,
    "cross_avg_min": 0.22,
}

RESCUE_PASS1 = {
    "min_avg_similarity": 0.30,
    "min_sim": 0.15,
}

RESCUE_PASS2 = {
    "min_avg_similarity": 0.25,
    "min_sim": 0.10,
}

OUTLIER_CONFIG = {
    "relative_factor": 0.85,
    "hard_floor": 0.35,
    "absolute_min_avg": 0.22,
}
