from __future__ import annotations

import json
from pathlib import Path


def load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main() -> None:
    expected = load("backend/tests/fixtures/expected_snapshot.json")
    actual = load("backend/tests/fixtures/actual_snapshot.json")

    exp = expected["summary"]
    act = actual["summary"]

    keys = ["n_faces", "n_clusters", "n_clustered", "n_unidentified"]
    mismatches = [k for k in keys if int(exp[k]) != int(act[k])]

    if mismatches:
        print("Snapshot mismatch:")
        for k in mismatches:
            print(f"  {k}: expected={exp[k]} actual={act[k]}")
        raise SystemExit(1)

    print("Snapshot OK")


if __name__ == "__main__":
    main()
