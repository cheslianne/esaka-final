from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class MarketPriceForecastBase(BaseModel):
    commodity: str
    price_type: str
    data_source: str
    etl_cadence: str
    forecast_date: date
    forecast_price_low: Decimal
    forecast_price_high: Decimal


class MarketPriceForecastCreate(
    MarketPriceForecastBase
):
    pass


class MarketPriceForecastResponse(
    MarketPriceForecastBase
):
    market_price_forecast_id: int
    generated_at: datetime | None = None

    model_config = ConfigDict(
        from_attributes=True
    )

# ============================================================
# NEW: MONTHLY AGGREGATED RESPONSE
# ============================================================

class MonthlyMarketPriceForecastResponse(BaseModel):
    commodity: str
    price_type: str
    data_source: str
    etl_cadence: str
    year: int
    month: int
    forecast_price_low: Decimal
    forecast_price_high: Decimal