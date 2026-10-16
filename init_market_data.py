"""Populate market prices and forecasts for a newly provisioned database."""

from src.etl_pipeline.market_price_etl import run_market_price_etl
from src.etl_pipeline.market_price_forecast import run_forecast


def main() -> None:
    loaded = run_market_price_etl()
    if loaded == 0:
        raise RuntimeError("Market-price seed data produced no records.")

    summary = run_forecast()
    print(f"Initial market data loaded: {loaded}; forecasts generated: {summary}")


if __name__ == "__main__":
    main()
