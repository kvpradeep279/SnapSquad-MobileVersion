"""
Health check endpoint — used by monitoring, load balancers, and deployment health probes.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """Basic health check. Returns 200 if the server is running."""
    return {"status": "ok", "service": "snapsquad-backend", "version": "1.0.0"}
