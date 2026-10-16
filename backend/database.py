import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Do not silently fall back to SQLite in production. Require DATABASE_URL when ENVIRONMENT=production.
db_url = os.getenv("DATABASE_URL")
if os.getenv("ENVIRONMENT") == "production" and not db_url:
    raise RuntimeError("DATABASE_URL must be set in production")

SQLALCHEMY_DATABASE_URL = db_url or "sqlite:///./sql_app.db"

if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
