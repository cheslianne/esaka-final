from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
import shutil

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from sqlalchemy.orm import Session

from src.core.database import get_db, SessionLocal
from src.models.market_price import MarketPrice
from src.models.etl_run_log import ETLRunLog
from src.api.schemas.market_price import (
    MarketPriceCreate,
    MarketPriceResponse
)
from src.etl_pipeline.market_price_etl import run_market_price_etl
from src.etl_pipeline.market_price_forecast import run_forecast


router = APIRouter(
    prefix="/api/market-prices",
    tags=["Market Prices"]
)


# ============================================================
# ETL LOGGING HELPER
# ============================================================

def _log_etl_step(data_source: str, status: str, error_message: str | None = None):
    """
    Record an ETL step in the etl_run_log table.

    Args:
        data_source: Label ng step (e.g., "Market Price Upload — ETL")
        status: "SUCCESS" o "FAILED"
    """
    db = SessionLocal()
    try:
        log = ETLRunLog(
            run_date_time=datetime.now(),
            data_source=data_source,
            status=status,
            error_message=error_message,
        )
        db.add(log)
        db.commit()
        print(f">>> ETL LOG: [{status}] {data_source}")
    except Exception as e:
        db.rollback()
        print(f">>> Failed to log ETL step: {e}")
    finally:
        db.close()


# ============================================================
# GET ALL MARKET PRICES
# ============================================================

@router.get(
    "/",
    response_model=list[MarketPriceResponse]
)
def get_market_prices(
    db: Session = Depends(get_db)
):
    return (
        db.query(MarketPrice)
        .order_by(MarketPrice.record_date.asc())
        .all()
    )


# ============================================================
# CREATE ONE MARKET PRICE
# ============================================================

@router.post(
    "/",
    response_model=MarketPriceResponse
)
def create_market_price(
    data: MarketPriceCreate,
    db: Session = Depends(get_db)
):

    market_price = MarketPrice(
        commodity=data.commodity,
        wholesale_price_per_kg=data.wholesale_price_per_kg,
        retail_price_per_kg=data.retail_price_per_kg,
        record_date=data.record_date,
        data_source=data.data_source
    )

    db.add(market_price)
    db.commit()
    db.refresh(market_price)

    return market_price


# ============================================================
# UPLOAD EXCEL + TRIGGER ETL + FORECAST
# ============================================================

def _process_uploaded_file(file_path: Path):
    """
    Background task: run ETL then forecast.
    Logs each step sa etl_run_log table.
    Deletes the temp file when done.
    """

    try:
        print()
        print("=" * 60)
        print("UPLOAD PIPELINE STARTED")
        print("=" * 60)

        # ----------------------------------------------------
        # STEP 1: ETL (extract -> transform -> load)
        # ----------------------------------------------------

        print()
        print(">>> Running ETL...")

        try:
            loaded = run_market_price_etl(excel_path=file_path)
            _log_etl_step("Market Price Upload — ETL", "SUCCESS")
            print(f">>> ETL done. Records loaded: {loaded}")
        except Exception as e:
            _log_etl_step(
                "Market Price Upload — ETL",
                "FAILED",
                f"{type(e).__name__}: {e}",
            )
            raise

        # ----------------------------------------------------
        # STEP 2: FORECAST
        # ----------------------------------------------------

        print()
        print(">>> Running forecast...")

        try:
            summary = run_forecast()
            _log_etl_step("Market Price Upload — Forecast", "SUCCESS")
            print(f">>> Forecast done. {summary}")
        except Exception as e:
            _log_etl_step(
                "Market Price Upload — Forecast",
                "FAILED",
                f"{type(e).__name__}: {e}",
            )
            raise

        print()
        print("=" * 60)
        print("UPLOAD PIPELINE COMPLETED")
        print("=" * 60)

    except Exception as e:
        print()
        print("=" * 60)
        print("UPLOAD PIPELINE FAILED")
        print("=" * 60)
        print(f"Error: {e}")

    finally:
        # Always clean up the temp file
        try:
            file_path.unlink(missing_ok=True)
        except Exception:
            pass


@router.post("/upload")
async def upload_market_prices(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Upload a market prices Excel file.

    - Validates file extension
    - Saves to temp file
    - Schedules ETL + Forecast as background tasks
    - Returns immediately

    The Excel file must contain a sheet named "market_prices"
    with columns:
        - commodity
        - wholesale_price_per_kg
        - retail_price_per_kg
        - record_date
    """

    # --------------------------------------------------------
    # VALIDATE FILE EXTENSION
    # --------------------------------------------------------

    if not file.filename:
        raise HTTPException(400, "No filename provided.")

    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            400,
            "Invalid file type. Only .xlsx or .xls is allowed."
        )

    # --------------------------------------------------------
    # SAVE UPLOADED FILE TO TEMP
    # --------------------------------------------------------

    try:
        with NamedTemporaryFile(
            delete=False,
            suffix=".xlsx"
        ) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = Path(tmp.name)
    except Exception as e:
        raise HTTPException(
            500,
            f"Failed to save uploaded file: {e}"
        )

    # --------------------------------------------------------
    # SCHEDULE BACKGROUND TASK
    # --------------------------------------------------------

    background_tasks.add_task(_process_uploaded_file, tmp_path)

    # --------------------------------------------------------
    # RETURN IMMEDIATELY
    # --------------------------------------------------------

    return {
        "status": "accepted",
        "message": (
            "File received. ETL and forecast are running "
            "in the background. Please refresh the dashboard "
            "after a few minutes."
        ),
        "filename": file.filename,
    }
