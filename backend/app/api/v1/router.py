"""
API v1 router — registers all endpoint groups.

V1 endpoints:
    /health          -> Server health check
    /auth/*          -> Signup, login, delete account
    /albums/*        -> Create album, upload photos, trigger clustering, check status
    /albums/*/clusters/* -> View clusters, download photos, rename, merge, eject
    /people/*        -> Global identity / people management

V2 endpoints:
    /rooms/*         -> Create room, join, approve members, upload, browse, cluster
"""

from fastapi import APIRouter

from app.api.v1 import albums, auth, clusters, health, people, rooms, profile

api_router = APIRouter()

# Health check (no prefix — accessible at /api/v1/health)
api_router.include_router(health.router, tags=["health"])

# Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# People
api_router.include_router(people.router, prefix="/people", tags=["people"])

# Profile
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])

# Albums — upload, process, status
api_router.include_router(albums.router, prefix="/albums", tags=["albums"])

# Clusters — view, download, rename, merge, eject
api_router.include_router(clusters.router, prefix="/albums", tags=["clusters"])

# V2: Room endpoints (collaborative shared + event rooms)
api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
