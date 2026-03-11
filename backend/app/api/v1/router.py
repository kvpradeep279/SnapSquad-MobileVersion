"""
API v1 router — registers all endpoint groups.

V1 endpoints:
    /health          -> Server health check
    /auth/*          -> Signup, login
    /albums/*        -> Create album, upload photos, trigger clustering, check status
    /albums/*/clusters/* -> View clusters, download photos, rename, merge, eject

V2 additions (future):
    /rooms/*         -> Create room, join, register face, browse, download
"""

from fastapi import APIRouter

from app.api.v1 import albums, auth, clusters, health

api_router = APIRouter()

# Health check (no prefix — accessible at /api/v1/health)
api_router.include_router(health.router, tags=["health"])

# Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Albums — upload, process, status
api_router.include_router(albums.router, prefix="/albums", tags=["albums"])

# Clusters — view, download, rename, merge, eject
api_router.include_router(clusters.router, prefix="/albums", tags=["clusters"])

# V2 future: Room endpoints
# api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
