from pydantic import BaseModel
from datetime import date, datetime
from decimal import Decimal
from typing import Optional


class PriceDataBase(BaseModel):
    commodity: str
    price_per_kg: Decimal
    record_date: date


class PriceDataCreate(PriceDataBase):
    pass


class PriceDataUpdate(BaseModel):
    commodity: Optional[str] = None
    price_per_kg: Optional[Decimal] = None
    record_date: Optional[date] = None


class PriceDataResponse(PriceDataBase):
    price_data_id: int
    created_at: datetime

    class Config:
        from_attributes = True