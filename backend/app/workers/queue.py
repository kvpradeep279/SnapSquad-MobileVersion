"""
Redis + RQ job queue configuration.

The pipeline queue handles HDBSCAN clustering jobs asynchronously.
The mobile app triggers a job via POST /albums/{id}/process,
then polls GET /albums/{id}/status until it completes.

NOTE: RQ requires 'fork' multiprocessing and does not support Windows.
      Imports are lazy so the FastAPI server can still start on Windows
      for local development. The worker process must run on Linux.
"""

import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Lazy references — initialised on first call to get_queue()
_redis_conn = None
_pipeline_queue = None


def get_queue():
    """Return the RQ pipeline queue, creating it on first call.

    Raises RuntimeError on Windows where RQ is unsupported.
    """
    global _redis_conn, _pipeline_queue  # noqa: PLW0603
    if _pipeline_queue is None:
        from redis import Redis
        from rq import Queue

        _redis_conn = Redis.from_url(settings.redis_url)
        _pipeline_queue = Queue("pipeline", connection=_redis_conn)
    return _pipeline_queue
