from pydantic import BaseModel, field_serializer
from datetime import date, datetime
from decimal import Decimal
from typing import Optional


class ForecastBase(BaseModel):
    commodity: str
    variety: Optional[str] = None
    data_source: str
    etl_cadence: str
    price_movement_wow: Optional[Decimal] = None
    forecast_date: date
    forecast_price_low: Decimal
    forecast_price_high: Decimal


class ForecastCreate(ForecastBase):
    pass


class ForecastUpdate(BaseModel):
    commodity: Optional[str] = None
    variety: Optional[str] = None
    data_source: Optional[str] = None
    etl_cadence: Optional[str] = None
    price_movement_wow: Optional[Decimal] = None
    forecast_date: Optional[date] = None
    forecast_price_low: Optional[Decimal] = None
    forecast_price_high: Optional[Decimal] = None


class ForecastResponse(ForecastBase):
    forecast_id: int
    generated_at: datetime

    model_config = {"from_attributes": True}

    # ✅ I-serialize ang Decimal fields as float na 2 decimal places
    @field_serializer(
        "price_movement_wow",
        "forecast_price_low",
        "forecast_price_high",
        when_used="json",
    )
    def serialize_decimal(self, value: Optional[Decimal]) -> Optional[float]:
        if value is None:
            return None
        return float(round(value, 2))