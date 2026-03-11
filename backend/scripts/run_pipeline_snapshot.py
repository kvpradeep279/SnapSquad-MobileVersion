from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.pipeline.service import default_embeddings_path, run_pipeline_from_embeddings_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Run deterministic clustering snapshot")
    parser.add_argument("--embeddings", default=default_embeddings_path())
    parser.add_argument("--out", default="backend/tests/fixtures/actual_snapshot.json")
    args = parser.parse_args()

    result = run_pipeline_from_embeddings_file(args.embeddings)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print("Snapshot written:", out)
    print("Faces:", result["summary"]["n_faces"])
    print("Clusters:", result["summary"]["n_clusters"])
    print("Clustered:", result["summary"]["n_clustered"])
    print("Unidentified:", result["summary"]["n_unidentified"])


if __name__ == "__main__":
    main()
