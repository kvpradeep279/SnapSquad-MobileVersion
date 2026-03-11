"""
Storage layer — local filesystem store for development.

In production, encrypted photo blobs go to Cloudinary (see cloudinary_store.py).
This local store is the fallback when Cloudinary is not configured, and is also
used for storing pipeline output JSON (cluster results, snapshots).

SECURITY NOTE:
    Photos stored here are AES-256 encrypted blobs — the server cannot read them.
    The encryption key (session_key for V1, room_key for V2) exists only on the
    mobile devices that uploaded or joined the room.
"""

import json
from pathlib import Path

from app.core.config import settings


class LocalStore:
    """Filesystem-based storage for encrypted blobs and pipeline outputs."""

    def __init__(self) -> None:
        self.root = Path(settings.data_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    # ── Album / photo storage ────────────────────────────────────

    def album_dir(self, album_id: str) -> Path:
        """Get (and create) the directory for an album's files."""
        p = self.root / "albums" / album_id
        p.mkdir(parents=True, exist_ok=True)
        return p

    def save_encrypted_blob(self, album_id: str, photo_id: str, blob: bytes) -> str:
        """Save an encrypted photo blob to disk. Returns the file path.

        The blob is already AES-256 encrypted on the mobile device.
        We store it as-is — the server cannot decrypt it.
        """
        out = self.album_dir(album_id) / f"{photo_id}.enc"
        out.write_bytes(blob)
        return str(out)

    def read_encrypted_blob(self, path: str) -> bytes:
        """Read an encrypted photo blob from disk."""
        return Path(path).read_bytes()

    def delete_encrypted_blob(self, path: str) -> None:
        """Delete an encrypted photo blob (after user downloads it)."""
        p = Path(path)
        if p.exists():
            p.unlink()

    # ── JSON storage (pipeline outputs, cluster results) ─────────

    def write_json(self, album_id: str, name: str, payload: dict) -> str:
        """Write a JSON payload to the album directory. Returns file path."""
        out = self.album_dir(album_id) / name
        out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return str(out)

    def read_json(self, path: str) -> dict:
        """Read a JSON file from disk."""
        return json.loads(Path(path).read_text(encoding="utf-8"))
