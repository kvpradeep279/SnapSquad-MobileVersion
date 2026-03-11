"""
Snapshot utilities — save and compare pipeline outputs for deterministic testing.

Used by scripts/run_pipeline_snapshot.py and scripts/compare_snapshot.py
to verify that clustering results remain stable across code changes.
"""

from pathlib import Path

from app.services.storage.local_store import LocalStore


def build_snapshot_payload(summary: dict, labels: list[int]) -> dict:
    """Build a snapshot payload from clustering results."""
    return {
        "summary": summary,
        "labels": labels,
    }


def save_snapshot(album_id: str, payload: dict) -> str:
    """Save a clustering snapshot to the local store."""
    store = LocalStore()
    return store.write_json(album_id, "snapshot.json", payload)


def load_expected_snapshot(path: str | Path) -> dict:
    """Load the expected snapshot from a fixture file for comparison."""
    p = Path(path)
    if not p.exists():
        return {}
    return __import__("json").loads(p.read_text(encoding="utf-8"))
