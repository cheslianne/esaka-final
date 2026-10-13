from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    func,
)
from sqlalchemy.orm import relationship

from src.core.database import Base


class ReportValidationHistory(Base):
    __tablename__ = "report_validation_history"

    history_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    submission_id = Column(
        Integer,
        ForeignKey("report_submissions.submission_id"),
        nullable=False,
    )

    action = Column(
        String(50),
        nullable=False,
    )

    performed_by = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False,
    )

    role = Column(
        String(50),
        nullable=False,
    )

    remarks = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )

    # ============================================================
    # RELATIONSHIPS
    # ============================================================

    submission = relationship(
        "ReportSubmission",
        back_populates="validation_history"
    )

    user = relationship(
        "User",
        foreign_keys=[performed_by]
    )