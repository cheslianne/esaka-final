from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import pandas as pd

from .market_price_load import load_market_prices


# ============================================================
# CONFIGURATION
# ============================================================

DATA_SOURCE = "SEED_DATA"


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SEED_EXCEL_PATH = PROJECT_ROOT / "data" / "seed_market_prices.xlsx"


# ============================================================
# GET LAST COMPLETED WEEK
# ============================================================

def get_last_completed_week():
    """
    Returns the Monday of the last completed week.
    """

    today = date.today()

    days_since_monday = today.weekday()
    this_monday = today - timedelta(days=days_since_monday)

    return this_monday - timedelta(days=7)


# ============================================================
# RESOLVE SHEET NAME (AUTO-DETECT)
# ============================================================

def _resolve_sheet_name(file_path: Path) -> str:
    """
    Determine which sheet to read from the Excel file.

    Priority:
        1. Sheet named "market_prices" (if it exists)
        2. Otherwise, the first sheet in the workbook

    Returns:
        str: The sheet name to read.
    """

    xls = pd.ExcelFile(file_path)
    sheet_names = xls.sheet_names

    if "market_prices" in sheet_names:
        print(f"Found sheet: 'market_prices'")
        return "market_prices"

    first_sheet = sheet_names[0]
    print(
        f"Sheet 'market_prices' not found. "
        f"Using first sheet: '{first_sheet}'"
    )
    print(f"Available sheets: {sheet_names}")

    return first_sheet


# ============================================================
# EXTRACT FROM EXCEL FILE
# ============================================================

def extract_seed_data(excel_path: Path = None):
    """
    Extract market price records from an Excel file.

    The sheet to read is auto-detected:
        - Prefers a sheet named "market_prices"
        - Falls back to the first sheet if not found

    Args:
        excel_path: Optional path to an Excel file.
                    If None, uses SEED_EXCEL_PATH (default seed file).

    Returns:
        List of record dicts.
    """

    records = []

    cutoff_date = get_last_completed_week()

    # --------------------------------------------------------
    # Determine which file to read
    # --------------------------------------------------------

    file_path = excel_path if excel_path is not None else SEED_EXCEL_PATH

    print(
        f"Historical data cutoff: "
        f"{cutoff_date.strftime('%B %d, %Y')} (Monday)"
    )

    if not file_path.exists():
        raise FileNotFoundError(
            f"Excel file not found: {file_path}"
        )

    print(f"Reading Excel file: {file_path}")

    # --------------------------------------------------------
    # Resolve sheet name (auto-detect)
    # --------------------------------------------------------

    sheet_name = _resolve_sheet_name(file_path)

    # --------------------------------------------------------
    # Read Excel
    # --------------------------------------------------------

    df = pd.read_excel(
        file_path,
        sheet_name=sheet_name
    )

    # --------------------------------------------------------
    # Normalize columns
    # --------------------------------------------------------

    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .str.replace(" ", "_")
    )

    # --------------------------------------------------------
    # Convert date column
    # --------------------------------------------------------

    df["record_date"] = pd.to_datetime(
        df["record_date"]
    ).dt.date

    # --------------------------------------------------------
    # Build records
    # --------------------------------------------------------

    for _, row in df.iterrows():

        record_date = row["record_date"]

        if record_date > cutoff_date:
            continue

        records.append({
            "commodity": row["commodity"],
            "wholesale_price_per_kg": row["wholesale_price_per_kg"],
            "retail_price_per_kg": row["retail_price_per_kg"],
            "record_date": record_date,
            "data_source": DATA_SOURCE,
        })

    return records


# ============================================================
# TRANSFORM AND VALIDATE
# ============================================================

def transform_market_prices(records):

    transformed_records = []

    for record in records:

        wholesale = Decimal(str(record["wholesale_price_per_kg"]))
        retail = Decimal(str(record["retail_price_per_kg"]))

        if wholesale <= 0:
            continue

        if retail <= 0:
            continue

        if retail < wholesale:
            continue

        transformed_records.append({
            "commodity": record["commodity"],
            "wholesale_price_per_kg": wholesale,
            "retail_price_per_kg": retail,
            "record_date": record["record_date"],
            "data_source": record["data_source"],
        })

    return transformed_records


# ============================================================
# ETL PIPELINE
# ============================================================

def run_market_price_etl(excel_path: Path = None):
    """
    Run the full Market Price ETL pipeline.

    Args:
        excel_path: Optional path to an Excel file.
                    If None, uses SEED_EXCEL_PATH (default seed file).

    Returns:
        int: Number of records loaded (inserted + updated).
    """

    print()
    print("=" * 60)
    print("MARKET PRICE ETL PIPELINE (WEEKLY)")
    print("=" * 60)

    # --------------------------------------------------------
    # EXTRACT
    # --------------------------------------------------------

    print()
    print("STEP 1: EXTRACT")
    print("Extracting weekly data from Excel file...")

    cutoff_date = get_last_completed_week()

    print(
        "Latest allowed historical week: "
        f"{cutoff_date.strftime('%B %d, %Y')}"
    )

    extracted_records = extract_seed_data(excel_path=excel_path)

    print(f"Records extracted: {len(extracted_records)}")

    # --------------------------------------------------------
    # TRANSFORM + VALIDATE
    # --------------------------------------------------------

    print()
    print("STEP 2: TRANSFORM + VALIDATE")

    transformed_records = transform_market_prices(extracted_records)

    print(f"Valid records: {len(transformed_records)}")

    print(
        f"Invalid records removed: "
        f"{len(extracted_records) - len(transformed_records)}"
    )

    # --------------------------------------------------------
    # LOAD
    # --------------------------------------------------------

    print()
    print("STEP 3: LOAD")
    print("Loading records into market_prices...")

    loaded_records = load_market_prices(transformed_records)

    print()
    print("=" * 60)
    print("MARKET PRICE ETL COMPLETED")
    print("=" * 60)

    print(f"Records loaded: {loaded_records}")
    print(
        f"Historical data through: "
        f"{cutoff_date.strftime('%B %d, %Y')}"
    )

    return loaded_records


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    run_market_price_etl()