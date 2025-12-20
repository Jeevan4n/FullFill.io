from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config.config import SQLALCHEMY_DATABASE_URI

engine = create_engine(SQLALCHEMY_DATABASE_URI)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_session():
    """Utility function to get a new SQLAlchemy session."""
    return SessionLocal()

def safe_close(session):
    try:
        session.close()
    except:
        pass