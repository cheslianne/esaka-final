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


class ReportSubmission(Base):
    __tablename__ = "report_submissions"

    submission_id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("raw_plant_reports.report_id"), nullable=False, unique=True)
    status = Column(String(50), nullable=False, default="DRAFT")
    current_validator_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    current_validator_role = Column(String(50), nullable=True)
    revision_remarks = Column(Text, nullable=True)
    revision_count = Column(Integer, nullable=False, default=0)
    submitted_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    flagged_at = Column(DateTime, nullable=True)  
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


    # ============================================================
    # RELATIONSHIPS
    # ============================================================

    report = relationship(
        "RawPlantReport",
        back_populates="submission"
    )

    current_validator = relationship(
        "User",
        foreign_keys=[current_validator_id]
    )

    validation_history = relationship(
        "ReportValidationHistory",
        back_populates="submission",
        cascade="all, delete-orphan"
    )