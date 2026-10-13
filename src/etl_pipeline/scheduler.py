import sys
import importlib
import pkgutil

# ============================================================
# LOAD ALL SQLALCHEMY MODELS
# ============================================================

import src.models as models_pkg

for _, module_name, _ in pkgutil.iter_modules(models_pkg.__path__):
    importlib.import_module(
        f"src.models.{module_name}"
    )


# ============================================================
# DATABASE
# ============================================================

from src.core.database import SessionLocal
from src.models.etl_run_log import ETLRunLog

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


# ============================================================
# ETL IMPORTS
# ============================================================

from apscheduler.schedulers.blocking import BlockingScheduler
from src.etl_pipeline.forecast_runtime import ensure_forecast_runtime

from src.etl_pipeline.psa_testfile import main as run_psa
from src.etl_pipeline.forecast import main as run_forecast
from src.etl_pipeline.forecast_kalabasa import main as run_kalabasa_forecast
from src.etl_pipeline.red_onion import main as run_red_onion
from src.etl_pipeline.white_onion import main as run_white_onion
from src.etl_pipeline.market_price_etl import run_market_price_etl
from src.etl_pipeline.market_price_forecast import main as run_market_price_forecast


# ============================================================
# ETL RUN LOGGING
# ============================================================

def run_etl_step(data_source, etl_function):

    print()
    print("=" * 60)
    print(f"RUNNING: {data_source}")
    print("=" * 60)

    db = SessionLocal()

    try:

        # ----------------------------------------------------
        # RUN ETL
        # ----------------------------------------------------

        etl_function()

        # ----------------------------------------------------
        # SAVE SUCCESS LOG
        # ----------------------------------------------------

        log = ETLRunLog(
            data_source=data_source,
            status="SUCCESS"
        )

        db.add(log)
        db.commit()

        print()
        print(f"{data_source} -> SUCCESS")

    except Exception as error:

        # ----------------------------------------------------
        # PRINT ACTUAL ERROR TO TERMINAL
        # ----------------------------------------------------

        print()
        print("=" * 60)
        print(f"{data_source} -> FAILED")
        print("=" * 60)

        error_message = f"{type(error).__name__}: {error}"
        print(f"ERROR: {error_message}")

        # ----------------------------------------------------
        # ROLLBACK ANY DATABASE TRANSACTION
        # ----------------------------------------------------

        db.rollback()

        # ----------------------------------------------------
        # SAVE FAILED LOG
        # ----------------------------------------------------

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

            print(
                f"Could not save ETL log: {log_error}"
            )

    finally:

        db.close()


# ============================================================
# RUN ETL PIPELINE
# ============================================================

def run_pipeline():

    ensure_forecast_runtime()

    print()
    print("=" * 60)
    print("STARTING QUARTERLY PSA ETL PIPELINE")
    print("=" * 60)


    # --------------------------------------------------------
    # STEP 1: PSA OPENSTAT
    # --------------------------------------------------------

    print()
    print("STEP 1: FETCHING PSA OPENSTAT DATA")

    run_etl_step(
        "PSA OpenSTAT",
        run_psa
    )


    # --------------------------------------------------------
    # STEP 2: RED ONION ETL
    # --------------------------------------------------------

    print()
    print("STEP 2: FETCHING RED ONION PSA DATA")

    run_etl_step(
        "Red Onion",
        run_red_onion
    )


    # --------------------------------------------------------
    # STEP 3: WHITE ONION ETL
    # --------------------------------------------------------

    print()
    print("STEP 3: FETCHING WHITE ONION PSA DATA")

    run_etl_step(
        "White Onion",
        run_white_onion
    )


    # --------------------------------------------------------
    # STEP 4: TOMATO FORECAST
    # --------------------------------------------------------

    print()
    print("STEP 4: GENERATING TOMATO FORECAST")

    run_etl_step(
        "Tomato Forecast",
        lambda: run_forecast("Tomato")
    )


    # --------------------------------------------------------
    # STEP 5: KALABASA FORECAST
    # --------------------------------------------------------

    print()
    print("STEP 5: GENERATING KALABASA FORECAST")

    run_etl_step(
        "Kalabasa Forecast",
        run_kalabasa_forecast
    )


    # --------------------------------------------------------
    # STEP 6: RED ONION FORECAST
    # --------------------------------------------------------

    print()
    print("STEP 6: GENERATING RED ONION FORECAST")

    run_etl_step(
        "Red Onion Forecast",
        lambda: run_forecast("Red Onion")
    )


    # --------------------------------------------------------
    # STEP 7: WHITE ONION FORECAST
    # --------------------------------------------------------

    print()
    print("STEP 7: GENERATING WHITE ONION FORECAST")

    run_etl_step(
        "White Onion Forecast",
        lambda: run_forecast("White Onion")
    )

    run_etl_step(
        "Market Price ETL",
        run_market_price_etl
    )

    run_etl_step(
        "Market Price Forecast",
        run_market_price_forecast
    )


    # --------------------------------------------------------
    # PIPELINE COMPLETE
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print("QUARTERLY ETL PIPELINE COMPLETED")
    print("=" * 60)



# ============================================================
# QUARTERLY SCHEDULER
# ============================================================

scheduler = BlockingScheduler(
    timezone="Asia/Manila"
)


scheduler.add_job(
    run_pipeline,
    trigger="cron",

    # January, April, July, October
    month="1,4,7,10",

    # First day of the month
    day=1,

    # 8:00 AM Philippine time
    hour=8,
    minute=0,

    id="quarterly_psa_etl",
    replace_existing=True,
)


# ============================================================
# START SCHEDULER
# ============================================================

def start_scheduler():

    ensure_forecast_runtime()

    print()
    print("=" * 60)
    print("eSAKA QUARTERLY ETL SCHEDULER")
    print("=" * 60)

    print("Schedule: January, April, July, October")
    print("Time: 8:00 AM Asia/Manila")
    print("Source: PSA OpenSTAT")

    print()
    print("Scheduler is running...")

    scheduler.start()

# ============================================================
# COMMAND LINE ENTRY
# ============================================================

if __name__ == "__main__":

    if "--run-now" in sys.argv:

        print()
        print("=" * 60)
        print("MANUAL ETL RUN")
        print("=" * 60)

        run_pipeline()

        sys.exit(0)

    start_scheduler()