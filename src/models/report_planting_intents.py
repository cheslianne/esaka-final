from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from src.core.database import Base

class ReportPlantingIntent(Base):
    __tablename__ = "report_planting_intents"
    
    report_id = Column(
        Integer, 
        ForeignKey("raw_plant_reports.report_id", ondelete="CASCADE"), 
        primary_key=True
    )
    planting_intent_id = Column(
        Integer, 
        ForeignKey("planting_intents.planting_intent_id", ondelete="CASCADE"), 
        primary_key=True
    )

    finalized_status_snapshot = Column(String, default="NOT PLANTED")
    plant_status_snapshot = Column(String, nullable=True)
    
    report = relationship("RawPlantReport", back_populates="planting_intents")
    planting_intent = relationship("PlantingIntent")