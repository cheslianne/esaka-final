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


# ============================================================
# GET LAST COMPLETED WEEK
# ============================================================

def get_last_completed_week():

    today = date.today()

    days_since_monday = today.weekday()
    this_monday = today - timedelta(days=days_since_monday)

    return this_monday - timedelta(days=7)


# ============================================================
# GET UNIQUE COMMODITIES FROM DATABASE
# ============================================================

def get_commodities_from_db():

    db = SessionLocal()

    try:

        result = db.execute(
            select(MarketPrice.commodity)
            .distinct()
            .order_by(MarketPrice.commodity)
        )

        commodities = [row[0] for row in result.all()]

        return commodities

    finally:
        db.close()


# ============================================================
# GET HISTORICAL MARKET PRICE DATA
# ============================================================

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

        result = db.execute(
            select(
                MarketPrice.record_date,
                price_column
            )
            .where(
                MarketPrice.commodity == commodity,
                MarketPrice.record_date <= cutoff_date
            )
            .order_by(
                MarketPrice.record_date.asc()
            )
        )

        rows = result.all()

        data = []

        for row in rows:

            record_date = row[0]
            price = row[1]

            if price is None:
                continue

            price = Decimal(str(price))

            if price <= 0:
                continue

            data.append({
                "ds": record_date,
                "y": float(price)
            })

        return data

    finally:
        db.close()


# ============================================================
# GENERATE FORECAST
# ============================================================

def generate_forecast(commodity, price_type):

    historical_data = get_historical_data(commodity, price_type)

    print()
    print("=" * 60)
    print("MARKET PRICE FORECAST")
    print("=" * 60)

    print(f"Commodity: {commodity}")
    print(f"Price Type: {price_type}")
    print(f"Historical records: {len(historical_data)}")

    if len(historical_data) < 10:
        print("Not enough historical data for forecasting.")
        return []

    # ========================================================
    # PREPARE PROPHET DATA
    # ========================================================

    model_data = pd.DataFrame(historical_data)

    model_data["ds"] = pd.to_datetime(model_data["ds"])
    model_data["y"] = pd.to_numeric(model_data["y"])

    model_data = (
        model_data
        .sort_values("ds")
        .reset_index(drop=True)
    )

    last_date = model_data["ds"].max()

    print(f"Latest historical date: {last_date.date()}")

    # ========================================================
    # CREATE PROPHET MODEL
    # ========================================================

    ensure_forecast_runtime()
    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        interval_width=0.80
    )

    model.fit(model_data)

    # ========================================================
    # CREATE FUTURE DATES (WEEKLY)
    # ========================================================

    future = model.make_future_dataframe(
        periods=FORECAST_WEEKS,
        freq="W"
    )

    forecast = model.predict(future)

    # ========================================================
    # ONLY FUTURE DATES
    # ========================================================

    future_forecast = forecast[
        forecast["ds"] > last_date
    ].copy()

    future_forecast = (
        future_forecast
        .sort_values("ds")
        .head(FORECAST_WEEKS)
    )

    # ========================================================
    # PREPARE RESULTS
    # ========================================================

    results = []

    for _, row in future_forecast.iterrows():

        forecast_date = row["ds"].date()

        predicted_low = max(0.01, float(row["yhat_lower"]))
        predicted_high = max(predicted_low, float(row["yhat_upper"]))

        result = {
            "commodity": commodity,
            "price_type": price_type,
            "data_source": DATA_SOURCE,
            "etl_cadence": ETL_CADENCE,
            "forecast_date": forecast_date,
            "forecast_price_low": Decimal(f"{predicted_low:.2f}"),
            "forecast_price_high": Decimal(f"{predicted_high:.2f}")
        }

        results.append(result)

    return results


# ============================================================
# SAVE FORECAST
# ============================================================

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
                table.c.price_type == price_type
            )
        )

        db.execute(
            insert(table),
            results
        )

        db.commit()

        return len(results)

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


# ============================================================
# RUN ALL MARKET PRICE FORECASTS
# ============================================================

def run_forecast():
    """
    Run the full market price forecasting pipeline.

    Returns:
        dict: Summary containing:
            - total_loaded (int): total forecast records saved
            - commodities (list): commodities processed
            - price_types (list): price types processed
    """

    print()
    print("=" * 60)
    print("MARKET PRICE FORECASTING PIPELINE (WEEKLY)")
    print("=" * 60)

    cutoff_date = get_last_completed_week()

    print(f"Historical data cutoff: {cutoff_date}")
    print(f"Forecast period: {FORECAST_WEEKS} weeks")

    # --------------------------------------------------------
    # GET COMMODITIES FROM DATABASE
    # --------------------------------------------------------

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
                    f"PHP "
                    f"{result['forecast_price_low']:.2f}"
                    f" - "
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

    # --------------------------------------------------------
    # RETURN SUMMARY (for API / caller use)
    # --------------------------------------------------------

    return {
        "total_loaded": total_loaded,
        "commodities": commodities,
        "price_types": price_types,
    }


# ============================================================
# LEGACY ALIAS (backward compatibility)
# ============================================================

def main():
    """
    Legacy entry point. Calls run_forecast().

    Kept for backward compatibility with any existing
    callers that still use main().
    """
    return run_forecast()


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    run_forecast()