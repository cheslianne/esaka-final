from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class MarketPriceBase(BaseModel):
    commodity: str
    wholesale_price_per_kg: Decimal
    retail_price_per_kg: Decimal
    record_date: date
    data_source: str = "SEED_DATA"


class MarketPriceCreate(MarketPriceBase):
    pass


class MarketPriceResponse(MarketPriceBase):
    market_price_id: int
    created_at: datetime | None = None

    model_config = ConfigDict(
        from_attributes=True
    )