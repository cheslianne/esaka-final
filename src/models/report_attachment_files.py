from sqlalchemy import Column, Integer, String, LargeBinary, DateTime
from sqlalchemy.sql import func

from src.core.database import Base


class ReportAttachmentFile(Base):
    """File bytes for report attachments, kept in the DB because the
    deployment filesystem is ephemeral."""

    __tablename__ = "report_attachment_files"
    __audit_skip__ = True

    stored_name = Column(String(255), primary_key=True)
    report_id = Column(Integer, nullable=False, index=True)
    content_type = Column(String(150), nullable=True)
    content = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
