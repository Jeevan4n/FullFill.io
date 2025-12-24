import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, Float, DateTime
from models.base import Base


class ImportJob(Base):
    __tablename__ = "import_jobs"  # better table name

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(String(50), nullable=False, default="queued")

    total_rows = Column(Integer, default=0, nullable=False)
    processed_rows = Column(Integer, default=0, nullable=False)
    success_count = Column(Integer, default=0, nullable=False)
    error_count = Column(Integer, default=0, nullable=False)

    error_message = Column(Text, nullable=True)

    file_path = Column(String(500), nullable=False)
    file_size_mb = Column(Float, default=0.0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        progress = int((self.processed_rows / self.total_rows * 100)) if self.total_rows > 0 else 0
        return {
            "job_id": self.id,
            "status": self.status,
            "total_rows": self.total_rows,
            "processed_rows": self.processed_rows,
            "success_count": self.success_count,
            "error_count": self.error_count,
            "progress": progress,
            "file_path": self.file_path,
            "file_size_mb": round(self.file_size_mb, 2),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "error_message": self.error_message
        }