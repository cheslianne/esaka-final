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

COMMODITY = "Squash fruit"

# Number of future months to forecast
FORECAST_MONTHS = 6

DATA_SOURCE = "PSA OpenSTAT"
ETL_CADENCE = "Quarterly"


# ============================================================
# GET HISTORICAL PRICE DATA
# ============================================================

def get_historical_data():

    db = SessionLocal()

    try:

        result = db.execute(
            select(
                PriceData.record_date,
                PriceData.price_per_kg
            )
            .where(
                PriceData.commodity == COMMODITY
            )
            .order_by(
                PriceData.record_date
            )
        )

        rows = result.all()

        data = []

        for row in rows:

            if row.price_per_kg is None:
                continue

            # Do not use zero as training data
            if Decimal(str(row.price_per_kg)) <= 0:
                continue

            data.append({
                "ds": row.record_date,
                "y": float(row.price_per_kg)
            })

        return data

    finally:
        db.close()


# ============================================================
# GENERATE FORECAST
# ============================================================

def generate_forecast():

    historical_data = get_historical_data()

    print()
    print("=" * 60)
    print("PSA FARMGATE PRICE FORECAST")
    print("=" * 60)

    print(f"Commodity: {COMMODITY}")
    print(f"Historical records: {len(historical_data)}")

    if len(historical_data) < 3:
        print("Not enough historical data for forecasting.")
        return []

    # ========================================================
    # PREPARE PROPHET DATA
    # ========================================================

    model_data = pd.DataFrame(historical_data)

    model_data["ds"] = pd.to_datetime(model_data["ds"])
    model_data["y"] = pd.to_numeric(model_data["y"])

    print()
    print("TRAINING DATA:")

    for _, row in model_data.iterrows():

        print(
            f"{row['ds'].date()} | "
            f"PHP {row['y']:.2f}/kg"
        )

    # ========================================================
    # CREATE PROPHET MODEL
    # ========================================================

    ensure_forecast_runtime()
    model = Prophet(
        stan_backend="CMDSTANPY",
        yearly_seasonality=False,
        weekly_seasonality=False,
        daily_seasonality=False,
        interval_width=0.80
    )

    model.fit(model_data)

    # ========================================================
    # CREATE FUTURE DATES
    # ========================================================

    future = model.make_future_dataframe(
        periods=FORECAST_MONTHS,
        freq="MS"
    )

    forecast = model.predict(future)

    # Only future dates
    last_date = model_data["ds"].max()

    future_forecast = forecast[
        forecast["ds"] > last_date
    ]

    # ========================================================
    # PREPARE RESULTS
    # ========================================================

    results = []

    for _, row in future_forecast.iterrows():

        forecast_date = row["ds"].date()

        predicted_low = max(
            0.01,
            float(row["yhat_lower"])
        )

        predicted_high = max(
            predicted_low,
            float(row["yhat_upper"])
        )

        result = {
            "commodity": COMMODITY,
            "variety": None,
            "data_source": DATA_SOURCE,
            "etl_cadence": ETL_CADENCE,
            "price_movement_wow": None,
            "forecast_date": forecast_date,
            "forecast_price_low": Decimal(
                f"{predicted_low:.2f}"
            ),
            "forecast_price_high": Decimal(
                f"{predicted_high:.2f}"
            )
        }

        results.append(result)

    return results


# ============================================================
# SAVE FORECAST TO DATABASE
# ============================================================

def save_forecasts(results):

    if not results:
        print("No forecast results to save.")
        return 0

    db = SessionLocal()

    try:

        # Remove existing forecasts for this commodity
        db.query(Forecast).filter(
            Forecast.commodity == COMMODITY
        ).delete(
            synchronize_session=False
        )

        for result in results:

            forecast_record = Forecast(
                commodity=result["commodity"],
                variety=result["variety"],
                data_source=result["data_source"],
                etl_cadence=result["etl_cadence"],
                price_movement_wow=result[
                    "price_movement_wow"
                ],
                forecast_date=result[
                    "forecast_date"
                ],
                forecast_price_low=result[
                    "forecast_price_low"
                ],
                forecast_price_high=result[
                    "forecast_price_high"
                ]
            )

            db.add(forecast_record)

        db.commit()

        return len(results)

    except Exception:

        db.rollback()
        raise

    finally:

        db.close()


# ============================================================
# MAIN
# ============================================================

def main():

    results = generate_forecast()

    print()
    print("=" * 60)
    print("FORECAST RESULTS")
    print("=" * 60)

    if not results:
        print("No forecast generated.")
        return

    for result in results:

        print(
            f"{result['forecast_date']} | "
            f"{result['commodity']} | "
            f"PHP "
            f"{result['forecast_price_low']:.2f}"
            f" - "
            f"{result['forecast_price_high']:.2f}/kg"
        )

    # ========================================================
    # SAVE
    # ========================================================

    print()
    print("=" * 60)
    print("LOADING FORECAST TO DATABASE")
    print("=" * 60)

    inserted = save_forecasts(results)

    print(f"Forecast records loaded: {inserted}")


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    main()