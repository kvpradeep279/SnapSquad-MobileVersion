"""
SQLAlchemy declarative base.

All ORM models inherit from this Base class.
The pgvector Vector type is registered here for use in models.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all database models.

    Using DeclarativeBase (SQLAlchemy 2.0 style) for type-safe mapped columns.
    Tables are auto-created in development; use Alembic migrations in production.
    """

    pass
