from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.models.market_price_forecast import MarketPriceForecast
from src.api.schemas.market_price_forecast import (
    MarketPriceForecastCreate,
    MarketPriceForecastResponse,
    MonthlyMarketPriceForecastResponse,
)

router = APIRouter(
    prefix="/api/market-price-forecasts",
    tags=["Market Price Forecasts"],
)


@router.get(
    "/",
    response_model=list[MarketPriceForecastResponse],
)
def get_market_price_forecasts(
    db: Session = Depends(get_db),
):
    return (
        db.query(MarketPriceForecast)
        .filter(MarketPriceForecast.forecast_price_low > Decimal("1.00"))
        .order_by(MarketPriceForecast.forecast_date.asc())
        .all()
    )


# ============================================================
# MONTHLY AGGREGATED FORECASTS (AVERAGE WEEKLY BAND)
# ============================================================

@router.get(
    "/monthly",
    response_model=list[MonthlyMarketPriceForecastResponse],
)
def get_monthly_market_price_forecasts(
    db: Session = Depends(get_db),
):
    """
    Weekly forecasts aggregated to monthly using the average
    weekly lower bound and average weekly upper bound.
    """
    forecasts = (
        db.query(MarketPriceForecast)
        .filter(MarketPriceForecast.forecast_price_low > Decimal("1.00"))
        .order_by(MarketPriceForecast.forecast_date.asc())
        .all()
    )

    grouped = {}

    for f in forecasts:
        key = (
            f.commodity,
            f.price_type,
            f.forecast_date.year,
            f.forecast_date.month,
        )

        low_val = Decimal(str(f.forecast_price_low))
        high_val = Decimal(str(f.forecast_price_high))

        if key not in grouped:
            grouped[key] = {
                "commodity": f.commodity,
                "price_type": f.price_type,
                "data_source": f.data_source,
                "etl_cadence": f.etl_cadence,
                "year": f.forecast_date.year,
                "month": f.forecast_date.month,
                "lows": [low_val],
                "highs": [high_val],
            }
        else:
            grouped[key]["lows"].append(low_val)
            grouped[key]["highs"].append(high_val)

    result = []
    for item in grouped.values():
        avg_low = (sum(item["lows"]) / Decimal(len(item["lows"]))).quantize(
            Decimal("0.01")
        )
        avg_high = (sum(item["highs"]) / Decimal(len(item["highs"]))).quantize(
            Decimal("0.01")
        )

        result.append({
            "commodity": item["commodity"],
            "price_type": item["price_type"],
            "data_source": item["data_source"],
            "etl_cadence": item["etl_cadence"],
            "year": item["year"],
            "month": item["month"],
            "forecast_price_low": avg_low,
            "forecast_price_high": max(avg_low, avg_high),
        })

    result.sort(
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
    response_model=MarketPriceForecastResponse,
)
def create_market_price_forecast(
    data: MarketPriceForecastCreate,
    db: Session = Depends(get_db),
):
    forecast = MarketPriceForecast(
        commodity=data.commodity,
        price_type=data.price_type,
        data_source=data.data_source,
        etl_cadence=data.etl_cadence,
        forecast_date=data.forecast_date,
        forecast_price_low=data.forecast_price_low,
        forecast_price_high=data.forecast_price_high,
    )
    db.add(forecast)
    db.commit()
    db.refresh(forecast)
    return forecast