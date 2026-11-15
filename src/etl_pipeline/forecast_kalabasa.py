from src.etl_pipeline.forecast import (
    generate_forecast as _generate_commodity_forecast,
    get_historical_data as _get_commodity_historical_data,
    main as run_commodity_forecast,
    save_forecasts as _save_commodity_forecasts,
)

COMMODITY = "Squash fruit"


def get_historical_data():
    return _get_commodity_historical_data(COMMODITY)


def generate_forecast():
    return _generate_commodity_forecast(COMMODITY)


def save_forecasts(results):
    return _save_commodity_forecasts(results, COMMODITY)


def main():
    return run_commodity_forecast(COMMODITY)


if __name__ == "__main__":
    main()