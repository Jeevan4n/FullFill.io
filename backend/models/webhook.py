from datetime import datetime
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Index
from .base import Base


class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    url = Column(String(512), nullable=False)
    event_type = Column(String(100), nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    secret = Column(String(255), nullable=True)  # for HMAC signing

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_webhooks_event_type_enabled", "event_type", "enabled"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "url": self.url,
            "event_type": self.event_type,
            "enabled": self.enabled,
            "has_secret": bool(self.secret),  # security: never expose real secret
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }