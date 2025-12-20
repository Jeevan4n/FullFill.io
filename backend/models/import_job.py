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
    error_message = Column(Text)
    file_path = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        progress = 0
        if self.total_rows > 0:
            progress = int((self.processed_rows / self.total_rows) * 100)

        return {
            "job_id": self.id,
            "status": self.status,
            "total_rows": self.total_rows,
            "processed_rows": self.processed_rows,
            "progress": progress,
            "error_message": self.error_message
        }
