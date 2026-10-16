from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from decimal import Decimal
from typing import Optional


class PlantingIntentBase(BaseModel):
    farmer_id: int
    commodity: str
    planting_date: date
    harvest_date: date
    volume: Decimal
    remarks: Optional[str] = None
    notes: Optional[str] = None  
    

class PlantingIntentCreate(PlantingIntentBase):
    pass


class PlantingIntentUpdate(BaseModel):
    farmer_id: Optional[int] = None
    commodity: Optional[str] = None
    planting_date: Optional[date] = None
    harvest_date: Optional[date] = None
    volume: Optional[Decimal] = None
    remarks: Optional[str] = None
    actual_planting_date: date | None = None  
    actual_harvest_date: date | None = None  
    actual_harvest_volume: float | None = None  
    notes: Optional[str] = None  


class PlantingIntentResponse(PlantingIntentBase):
    planting_intent_id: int
    created_at: datetime

    farmer_name: Optional[str] = None
    location: Optional[str] = None
    status: str = "Pending"
    attachment_url: Optional[str] = None

    actual_planting_date: Optional[date] = None
    actual_harvest_date: Optional[date] = None
    actual_harvest_volume: Optional[float] = None

    finalized_status: Optional[str] = "NOT PLANTED"
    barangay: Optional[str] = None
    municipality: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(
        from_attributes=True
    )
