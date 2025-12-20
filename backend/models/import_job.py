import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime
from models.base import Base

class ImportJob(Base):
    __tablename__ = "imports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(String(50), nullable=False, default="queued")
    total_rows = Column(Integer, default=0)
    processed_rows = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "status": self.status,
            "total_rows": self.total_rows,
            "processed_rows": self.processed_rows,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
