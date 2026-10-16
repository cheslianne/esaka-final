from sqlalchemy import (
    Column, Integer, String, Date, DECIMAL, Text, TIMESTAMP, ForeignKey, text, Boolean,
)
from sqlalchemy.orm import relationship
from src.core.database import Base


class PlantingIntent(Base):
    __tablename__ = "planting_intents"

    planting_intent_id = Column(Integer, primary_key=True, index=True)
    farmer_id = Column(Integer, ForeignKey("farmers.farmer_id"), nullable=False)

    commodity = Column(String(50), nullable=False)
    planting_date = Column(Date, nullable=False)
    harvest_date = Column(Date, nullable=False)
    volume = Column(DECIMAL(10, 2), nullable=False)
    remarks = Column(Text, nullable=True)

    actual_planting_date = Column(Date, nullable=True)
    actual_harvest_date = Column(Date, nullable=True)
    actual_harvest_volume = Column(DECIMAL(10, 2), nullable=True)

    notes = Column(Text, nullable=True)
    attachment_path = Column(String(500), nullable=True)

    status = Column(String(20), nullable=True, default="DRAFT")
    finalized_status = Column(String, default="NOT PLANTED", nullable=False)
    is_in_report = Column(Boolean, default=False, nullable=False, index=True)

    created_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))

    farmer = relationship("Farmer", back_populates="planting_intents")
    reports = relationship("ReportPlantingIntent", back_populates="planting_intent")