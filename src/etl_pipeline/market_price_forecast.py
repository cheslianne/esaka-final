from datetime import date, timedelta
from decimal import Decimal

import pandas as pd
from prophet import Prophet
from sqlalchemy import delete, insert, select

from src.core.database import SessionLocal
from src.etl_pipeline.forecast_runtime import ensure_forecast_runtime
from src.models.market_price import MarketPrice
from src.models.market_price_forecast import MarketPriceForecast


# ============================================================
# FORECAST SETTINGS
# ============================================================

FORECAST_WEEKS = 26

DATA_SOURCE = "SEED_DATA"
ETL_CADENCE = "Weekly"

PROPHET_INTERVAL_WIDTH = 0.45
PROPHET_CHANGEPOINT_SCALE = 0.015
MAX_BAND_PCT = 0.15


def get_last_completed_week():
    today = date.today()
    days_since_monday = today.weekday()
    this_monday = today - timedelta(days=days_since_monday)
    return this_monday - timedelta(days=7)


def get_commodities_from_db():
    db = SessionLocal()
    try:
        result = db.execute(
            select(MarketPrice.commodity)
            .distinct()
            .order_by(MarketPrice.commodity)
        )
        return [row[0] for row in result.all()]
    finally:
        db.close()


def get_historical_data(commodity, price_type):
    db = SessionLocal()
    try:
        if price_type == "WHOLESALE":
            price_column = MarketPrice.wholesale_price_per_kg
        elif price_type == "RETAIL":
            price_column = MarketPrice.retail_price_per_kg
        else:
            raise ValueError("price_type must be WHOLESALE or RETAIL")

        cutoff_date = get_last_completed_week()
        print(f"Historical cutoff date: {cutoff_date}")

        # Filter out NULLs and ZEROS directly in the SQL query
        result = db.execute(
            select(MarketPrice.record_date, price_column)
            .where(
                MarketPrice.commodity == commodity,
                MarketPrice.record_date <= cutoff_date,
                price_column.isnot(None),
                price_column > 0  # <--- THE CRITICAL FIX
            )
            .order_by(MarketPrice.record_date.asc())
        )

        data = []
        for record_date, price in result.all():
            if price is None:
                continue
            price_dec = Decimal(str(price))
            # Skip any zero, negative, or 0.01 placeholder prices
            if price_dec <= Decimal("1.00"):
                continue
            data.append({
                "ds": record_date,
                "y": float(price_dec),
            })

        return data
    finally:
        db.close()


def generate_forecast(commodity, price_type):
    historical_data = get_historical_data(commodity, price_type)

    print()
    print("=" * 60)
    print("MARKET PRICE FORECAST")
    print("=" * 60)
    print(f"Commodity: {commodity}")
    print(f"Price Type: {price_type}")
    print(f"Historical records: {len(historical_data)}")

    if len(historical_data) < 4:
        print("Not enough historical data for forecasting.")
        return []

    model_data = pd.DataFrame(historical_data)
    model_data["ds"] = pd.to_datetime(model_data["ds"])
    model_data["y"] = pd.to_numeric(model_data["y"])
    model_data = model_data.sort_values("ds").reset_index(drop=True)

    q10 = float(model_data["y"].quantile(0.10))
    q90 = float(model_data["y"].quantile(0.90))
    median_price = float(model_data["y"].median())
    recent_mean = float(model_data["y"].tail(8).mean())

    model_data["y"] = model_data["y"].clip(lower=q10, upper=q90)

    first_date = model_data["ds"].min()
    last_date = model_data["ds"].max()
    date_span_days = (last_date - first_date).days
    has_full_year = date_span_days >= 365 and len(model_data) >= 40

    print(f"Latest historical date: {last_date.date()} (Span: {date_span_days} days, Yearly Seasonality: {has_full_year})")

    ensure_forecast_runtime()
    model = Prophet(
        stan_backend="CMDSTANPY",
        yearly_seasonality=has_full_year,
        weekly_seasonality=False,
        daily_seasonality=False,
        interval_width=PROPHET_INTERVAL_WIDTH,
        changepoint_prior_scale=PROPHET_CHANGEPOINT_SCALE,
    )
    model.fit(model_data)

    future = model.make_future_dataframe(periods=FORECAST_WEEKS, freq="W")
    forecast = model.predict(future)

    future_forecast = (
        forecast[forecast["ds"] > last_date]
        .copy()
        .sort_values("ds")
        .head(FORECAST_WEEKS)
    )

    results = []
    anchor_floor = max(5.0, min(recent_mean, median_price, q10) * 0.75)
    anchor_cap = max(recent_mean, median_price) * 1.25

    for _, row in future_forecast.iterrows():
        forecast_date = row["ds"].date()

        center = max(anchor_floor, min(float(row["yhat"]), anchor_cap))
        raw_low = max(anchor_floor, float(row["yhat_lower"]))
        raw_high = max(raw_low, float(row["yhat_upper"]))

        max_half_band = center * MAX_BAND_PCT
        min_half_band = center * 0.05

        low_diff = min(max(center - raw_low, min_half_band), max_half_band)
        high_diff = min(max(raw_high - center, min_half_band), max_half_band)

        predicted_low = max(anchor_floor, center - low_diff)
        predicted_high = max(predicted_low, min(center + high_diff, anchor_cap * 1.10))

        results.append({
            "commodity": commodity,
            "price_type": price_type,
            "data_source": DATA_SOURCE,
            "etl_cadence": ETL_CADENCE,
            "forecast_date": forecast_date,
            "forecast_price_low": Decimal(f"{predicted_low:.2f}"),
            "forecast_price_high": Decimal(f"{predicted_high:.2f}"),
        })

    return results


def save_forecasts(results, commodity, price_type):
    if not results:
        print("No forecast results to save.")
        return 0

    db = SessionLocal()
    try:
        table = MarketPriceForecast.__table__
        db.execute(
            delete(table).where(
                table.c.commodity == commodity,
                table.c.price_type == price_type,
            )
        )
        db.execute(insert(table), results)
        db.commit()
        return len(results)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def run_forecast():
    print()
    print("=" * 60)
    print("MARKET PRICE FORECASTING PIPELINE (WEEKLY)")
    print("=" * 60)

    cutoff_date = get_last_completed_week()
    print(f"Historical data cutoff: {cutoff_date}")
    print(f"Forecast period: {FORECAST_WEEKS} weeks")

    commodities = get_commodities_from_db()
    print(f"Commodities found: {commodities}")

    price_types = ["WHOLESALE", "RETAIL"]
    total_loaded = 0

    for commodity in commodities:
        for price_type in price_types:
            results = generate_forecast(commodity, price_type)

            print()
            print(f"{commodity} - {price_type} FORECAST")

            if not results:
                print("No forecast generated.")
                continue

            for result in results:
                print(
                    f"{result['forecast_date']} | "
                    f"{result['commodity']} | "
                    f"{result['price_type']} | "
                    f"PHP {result['forecast_price_low']:.2f} - "
                    f"{result['forecast_price_high']:.2f}/kg"
                )

            inserted = save_forecasts(results, commodity, price_type)
            total_loaded += inserted
            print(f"Forecast records loaded: {inserted}")

    print()
    print("=" * 60)
    print("MARKET PRICE FORECASTING COMPLETED")
    print("=" * 60)
    print(f"Total forecast records loaded: {total_loaded}")

    return {
        "total_loaded": total_loaded,
        "commodities": commodities,
        "price_types": price_types,
    }


def main():
    return run_forecast()


if __name__ == "__main__":
    run_forecast()