from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.models.market_price_forecast import (
    MarketPriceForecast
)
from src.api.schemas.market_price_forecast import (
    MarketPriceForecastCreate,
    MarketPriceForecastResponse,
    MonthlyMarketPriceForecastResponse
)


router = APIRouter(
    prefix="/api/market-price-forecasts",
    tags=["Market Price Forecasts"]
)


@router.get(
    "/",
    response_model=list[MarketPriceForecastResponse]
)
def get_market_price_forecasts(
    db: Session = Depends(get_db)
):

    return (
        db.query(MarketPriceForecast)
        .order_by(
            MarketPriceForecast.forecast_date.asc()
        )
        .all()
    )


# ============================================================
# NEW: MONTHLY AGGREGATED FORECASTS
# ============================================================

@router.get(
    "/monthly",
    response_model=list[MonthlyMarketPriceForecastResponse]
)
def get_monthly_market_price_forecasts(
    db: Session = Depends(get_db)
):
    """
    Weekly forecasts aggregated to monthly.

    For each (commodity, price_type, year, month):
    - forecast_price_low = minimum of all weekly lows
    - forecast_price_high = maximum of all weekly highs
    """

    # --------------------------------------------------------
    # Get all forecasts
    # --------------------------------------------------------

    forecasts = (
        db.query(MarketPriceForecast)
        .order_by(
            MarketPriceForecast.forecast_date.asc()
        )
        .all()
    )

    # --------------------------------------------------------
    # Group by (commodity, price_type, year, month)
    # --------------------------------------------------------

    grouped = {}

    for f in forecasts:

        key = (
            f.commodity,
            f.price_type,
            f.forecast_date.year,
            f.forecast_date.month,
        )

        if key not in grouped:
            grouped[key] = {
                "commodity": f.commodity,
                "price_type": f.price_type,
                "data_source": f.data_source,
                "etl_cadence": f.etl_cadence,
                "year": f.forecast_date.year,
                "month": f.forecast_date.month,
                "forecast_price_low": f.forecast_price_low,
                "forecast_price_high": f.forecast_price_high,
            }
        else:
            if f.forecast_price_low < grouped[key]["forecast_price_low"]:
                grouped[key]["forecast_price_low"] = (
                    f.forecast_price_low
                )

            if f.forecast_price_high > grouped[key]["forecast_price_high"]:
                grouped[key]["forecast_price_high"] = (
                    f.forecast_price_high
                )

    # --------------------------------------------------------
    # Sort by (year, month, commodity, price_type)
    # --------------------------------------------------------

    result = sorted(
        grouped.values(),
        key=lambda x: (
            x["year"],
            x["month"],
            x["commodity"],
            x["price_type"],
        )
    )

    return result




@router.post(
    "/",
    response_model=MarketPriceForecastResponse
)
def create_market_price_forecast(
    data: MarketPriceForecastCreate,
    db: Session = Depends(get_db)
):

    forecast = MarketPriceForecast(
        commodity=data.commodity,
        price_type=data.price_type,
        data_source=data.data_source,
        etl_cadence=data.etl_cadence,
        forecast_date=data.forecast_date,
        forecast_price_low=data.forecast_price_low,
        forecast_price_high=data.forecast_price_high
    )

    db.add(forecast)
    db.commit()
    db.refresh(forecast)

    return forecast