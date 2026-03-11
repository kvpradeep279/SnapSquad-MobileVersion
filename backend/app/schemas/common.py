"""
Common response schemas used across multiple endpoints.
"""

from pydantic import BaseModel


class ApiResponse(BaseModel):
    """Generic success/failure response."""
    success: bool = True
    message: str = "ok"
