from sqlalchemy import Column, Integer, String, Date, Float, DateTime, Text, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from src.core.database import Base


class RawPlantReport(Base):
    __tablename__ = "raw_plant_reports"

    report_id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=True)
    commodity = Column(String, nullable=True)
    planting_date = Column(Date, nullable=True)
    estimated_yield = Column(Float, nullable=True)
    encoded_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    municipal_coordinator_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String, default="DRAFT", server_default="DRAFT", nullable=False, index=True)

    # ✅ Idinagdag: server_default
    attachments = Column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )

    municipality = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship(
        "User",
        back_populates="raw_plant_reports",
        foreign_keys=[encoded_by],
    )

    submission = relationship(
        "ReportSubmission",
        back_populates="report",
        uselist=False,
        cascade="all, delete-orphan",
    )

    planting_intents = relationship(
        "ReportPlantingIntent",
        back_populates="report",
        cascade="all, delete-orphan",
    )