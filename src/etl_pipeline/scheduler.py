import sys
import importlib
import pkgutil

import src.models as models_pkg

for _, module_name, _ in pkgutil.iter_modules(models_pkg.__path__):
    importlib.import_module(f"src.models.{module_name}")

from src.core.database import SessionLocal
from src.models.etl_run_log import ETLRunLog

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    BlockingScheduler = importlib.import_module(
        "apscheduler.schedulers.blocking"
    ).BlockingScheduler
except ModuleNotFoundError:
    BlockingScheduler = None

from src.etl_pipeline.forecast_runtime import ensure_forecast_runtime
from src.etl_pipeline.psa_testfile import main as run_psa
from src.etl_pipeline.forecast import main as run_forecast
from src.etl_pipeline.forecast_kalabasa import main as run_kalabasa_forecast
from src.etl_pipeline.red_onion import main as run_red_onion
from src.etl_pipeline.white_onion import main as run_white_onion
from src.etl_pipeline.market_price_etl import run_market_price_etl
from src.etl_pipeline.market_price_forecast import main as run_market_price_forecast


def _extract_loaded_count(result):
    """Normalize return values from ETL/Forecast functions into an integer count."""
    if isinstance(result, dict):
        return int(result.get("total_loaded", result.get("records_loaded", 0)) or 0)
    if isinstance(result, int):
        return result
    return 0


def run_etl_step(data_source, etl_function):
    print()
    print("=" * 60)
    print(f"RUNNING: {data_source}")
    print("=" * 60)

    db = SessionLocal()
    try:
        result = etl_function()
        records_loaded = _extract_loaded_count(result)

        if records_loaded <= 0:
            print()
            print(f"{data_source} -> 0 records loaded (SKIPPED from dashboard logs)")
            return 0

        log_kwargs = {
            "data_source": data_source,
            "status": "SUCCESS",
        }
        if hasattr(ETLRunLog, "records_loaded"):
            log_kwargs["records_loaded"] = records_loaded

        log = ETLRunLog(**log_kwargs)
        db.add(log)
        db.commit()

        print()
        print(f"{data_source} -> SUCCESS ({records_loaded} records)")
        return records_loaded

    except Exception as error:
        print()
        print("=" * 60)
        print(f"{data_source} -> FAILED")
        print("=" * 60)

        error_message = f"{type(error).__name__}: {error}"
        print(f"ERROR: {error_message}")

        db.rollback()
        try:
            log = ETLRunLog(
                data_source=data_source,
                status="FAILED",
                error_message=error_message,
            )
            db.add(log)
            db.commit()
        except Exception as log_error:
            db.rollback()
            print(f"Could not save ETL log: {log_error}")

        return 0
    finally:
        db.close()


def run_pipeline():
    ensure_forecast_runtime()

    print()
    print("=" * 60)
    print("STARTING QUARTERLY PSA ETL PIPELINE")
    print("=" * 60)

    run_etl_step("PSA OpenSTAT", run_psa)
    run_etl_step("Red Onion", run_red_onion)
    run_etl_step("White Onion", run_white_onion)
    run_etl_step("Tomato Forecast", lambda: run_forecast("Tomato"))
    run_etl_step("Kalabasa Forecast", run_kalabasa_forecast)
    run_etl_step("Red Onion Forecast", lambda: run_forecast("Red Onion"))
    run_etl_step("White Onion Forecast", lambda: run_forecast("White Onion"))
    run_etl_step("Market Price ETL", run_market_price_etl)
    run_etl_step("Market Price Forecast", run_market_price_forecast)

    print()
    print("=" * 60)
    print("QUARTERLY ETL PIPELINE COMPLETED")
    print("=" * 60)


scheduler = None
if BlockingScheduler is not None:
    scheduler = BlockingScheduler(timezone="Asia/Manila")
    scheduler.add_job(
        run_pipeline,
        trigger="cron",
        month="1,4,7,10",
        day=1,
        hour=8,
        minute=0,
        id="quarterly_psa_etl",
        replace_existing=True,
    )


def start_scheduler():
    ensure_forecast_runtime()
    if scheduler is None:
        raise RuntimeError(
            "APScheduler is required to start the scheduler. "
            "Install it with: pip install APScheduler"
        )
    print()
    print("=" * 60)
    print("eSAKA QUARTERLY ETL SCHEDULER")
    print("=" * 60)
    scheduler.start()


if __name__ == "__main__":
    if "--run-now" in sys.argv:
        run_pipeline()
        sys.exit(0)
    start_scheduler()