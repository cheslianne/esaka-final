from datetime import date
import pandas as pd
from decimal import Decimal

from prophet import Prophet
from sqlalchemy import select

from src.core.database import SessionLocal
from src.etl_pipeline.forecast_runtime import ensure_forecast_runtime
from src.models.price_data import PriceData
from src.models.forecasts import Forecast


# ============================================================
# FORECAST SETTINGS
# ============================================================

FORECAST_MONTHS = 6

DATA_SOURCE = "PSA OpenSTAT"
ETL_CADENCE = "Quarterly"

PROPHET_INTERVAL_WIDTH = 0.45
PROPHET_CHANGEPOINT_SCALE = 0.015
MAX_BAND_PCT = 0.18


def _baseline_forecast(commodity, historical_data):
    """Create a conservative monthly forecast when Prophet lacks enough history."""
    if not historical_data:
        return []

    ordered = sorted(historical_data, key=lambda row: row["ds"])
    latest_date = pd.Timestamp(ordered[-1]["ds"])
    latest_price = float(ordered[-1]["y"])
    prices = [float(row["y"]) for row in ordered]
    min_hist_price = min(prices)
    anchor_floor = max(5.0, min_hist_price * 0.70)

    observed_range = max(prices) - min(prices) if len(prices) > 1 else 0.0
    interval = min(
        max(observed_range / 4, latest_price * 0.08, 0.50),
        latest_price * MAX_BAND_PCT
    )
    trend = 0.0
    if len(ordered) > 1:
        first = float(ordered[0]["y"])
        trend = (latest_price - first) / (len(ordered) - 1)
        trend = max(-latest_price * 0.03, min(latest_price * 0.03, trend))

    results = []
    for month_offset in range(1, FORECAST_MONTHS + 1):
        forecast_date = latest_date + pd.offsets.MonthBegin(month_offset)
        predicted = max(anchor_floor, latest_price + trend * month_offset)
        results.append({
            "commodity": commodity,
            "variety": None,
            "data_source": DATA_SOURCE,
            "etl_cadence": ETL_CADENCE,
            "price_movement_wow": None,
            "forecast_date": forecast_date.date(),
            "forecast_price_low": Decimal(f"{max(anchor_floor, predicted - interval):.2f}"),
            "forecast_price_high": Decimal(f"{predicted + interval:.2f}"),
        })
    return results


def get_historical_data(commodity):
    db = SessionLocal()
    try:
        result = db.execute(
            select(PriceData.record_date, PriceData.price_per_kg)
            .where(PriceData.commodity == commodity)
            .order_by(PriceData.record_date)
        )

        data = []
        for row in result.all():
            if row.price_per_kg is None:
                continue
            if Decimal(str(row.price_per_kg)) <= Decimal("1.00"):
                continue
            data.append({
                "ds": row.record_date,
                "y": float(row.price_per_kg),
            })

        return data
    finally:
        db.close()


def generate_forecast(commodity):
    historical_data = get_historical_data(commodity)

    print()
    print("=" * 60)
    print("PSA FARMGATE PRICE FORECAST")
    print("=" * 60)
    print(f"Commodity: {commodity}")
    print(f"Historical records: {len(historical_data)}")

    if len(historical_data) < 3:
        print("Not enough historical data for Prophet; using baseline forecast.")
        return _baseline_forecast(commodity, historical_data)

    model_data = pd.DataFrame(historical_data)
    model_data["ds"] = pd.to_datetime(model_data["ds"])
    model_data["y"] = pd.to_numeric(model_data["y"])

    q15 = float(model_data["y"].quantile(0.15))
    q85 = float(model_data["y"].quantile(0.85))
    median_price = float(model_data["y"].median())
    recent_mean = float(model_data["y"].tail(6).mean())

    model_data["y"] = model_data["y"].clip(lower=q15, upper=q85)

    print()
    print("TRAINING DATA:")
    for _, row in model_data.iterrows():
        print(f"{row['ds'].date()} | PHP {row['y']:.2f}/kg")

    ensure_forecast_runtime()
    model = Prophet(
        stan_backend="CMDSTANPY",
        yearly_seasonality=False,
        weekly_seasonality=False,
        daily_seasonality=False,
        interval_width=PROPHET_INTERVAL_WIDTH,
        changepoint_prior_scale=PROPHET_CHANGEPOINT_SCALE,
    )
    model.fit(model_data)

    future = model.make_future_dataframe(periods=FORECAST_MONTHS, freq="MS")
    forecast = model.predict(future)

    last_date = model_data["ds"].max()
    future_forecast = forecast[forecast["ds"] > last_date]

    results = []
    anchor_floor = max(5.0, min(recent_mean, median_price, q15) * 0.75)
    anchor_cap = max(recent_mean, median_price) * 1.25

    for _, row in future_forecast.iterrows():
        forecast_date = row["ds"].date()

        center = max(anchor_floor, min(float(row["yhat"]), anchor_cap))
        raw_low = max(anchor_floor, float(row["yhat_lower"]))
        raw_high = max(raw_low, float(row["yhat_upper"]))

        max_half_band = center * MAX_BAND_PCT
        min_half_band = center * 0.06

        low_diff = min(max(center - raw_low, min_half_band), max_half_band)
        high_diff = min(max(raw_high - center, min_half_band), max_half_band)

        predicted_low = max(anchor_floor, center - low_diff)
        predicted_high = max(predicted_low, min(center + high_diff, anchor_cap * 1.10))

        results.append({
            "commodity": commodity,
            "variety": None,
            "data_source": DATA_SOURCE,
            "etl_cadence": ETL_CADENCE,
            "price_movement_wow": None,
            "forecast_date": forecast_date,
            "forecast_price_low": Decimal(f"{predicted_low:.2f}"),
            "forecast_price_high": Decimal(f"{predicted_high:.2f}"),
        })

    return results


def save_forecasts(results, commodity):
    if not results:
        print("No forecast results to save.")
        return 0

    db = SessionLocal()
    try:
        db.query(Forecast).filter(Forecast.commodity == commodity).delete(
            synchronize_session=False
        )
        for result in results:
            db.add(Forecast(**result))
        db.commit()
        return len(results)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main(commodity="Tomato"):
    results = generate_forecast(commodity)

    print()
    print("=" * 60)
    print("FORECAST RESULTS")
    print("=" * 60)

    if not results:
        print("No forecast generated.")
        return 0

    for result in results:
        print(
            f"{result['forecast_date']} | "
            f"{result['commodity']} | "
            f"PHP {result['forecast_price_low']:.2f} - "
            f"{result['forecast_price_high']:.2f}/kg"
        )

    print()
    print("=" * 60)
    print("LOADING FORECAST TO DATABASE")
    print("=" * 60)

    inserted = save_forecasts(results, commodity)
    print(f"Forecast records loaded: {inserted}")
    return inserted


if __name__ == "__main__":
    main()