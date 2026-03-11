"""
Database session management.

Provides:
    - engine: SQLAlchemy engine connected to PostgreSQL
    - SessionLocal: Session factory for creating DB sessions
    - get_db(): FastAPI dependency that yields a session per request
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    """FastAPI dependency — yields a database session, auto-closes after request.

    Usage:
        @router.get("/example")
        def example(db: Session = Depends(get_db)):
            ...
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
