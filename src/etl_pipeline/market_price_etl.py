from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
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
# HELPERS
# ============================================================

def get_last_completed_week():
    """Returns the Monday of the last completed week."""
    today = date.today()
    days_since_monday = today.weekday()
    this_monday = today - timedelta(days=days_since_monday)
    return this_monday - timedelta(days=7)


def _parse_positive_price(value) -> Decimal | None:
    """Return a positive Decimal, or None if the cell is 0, blank, NaN, or invalid."""
    if value is None or pd.isna(value):
        return None

    cleaned = str(value).strip().replace(",", "")
    if not cleaned or cleaned.lower() in {"0", "0.0", "0.00", "-", "--", "..", "na", "n/a", "nan", "none"}:
        return None

    try:
        price = Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None

    if price.is_nan() or price <= Decimal("0"):
        return None

    return price


def _resolve_sheet_name(file_path: Path) -> str:
    xls = pd.ExcelFile(file_path)
    sheet_names = xls.sheet_names

    if "market_prices" in sheet_names:
        print("Found sheet: 'market_prices'")
        return "market_prices"

    first_sheet = sheet_names[0]
    print(f"Sheet 'market_prices' not found. Using first sheet: '{first_sheet}'")
    return first_sheet


# ============================================================
# EXTRACT FROM EXCEL FILE
# ============================================================

def extract_seed_data(excel_path: Path = None):
    records = []
    cutoff_date = get_last_completed_week()
    file_path = excel_path if excel_path is not None else SEED_EXCEL_PATH

    print(f"Historical data cutoff: {cutoff_date.strftime('%B %d, %Y')} (Monday)")

    if not file_path.exists():
        raise FileNotFoundError(f"Excel file not found: {file_path}")

    print(f"Reading Excel file: {file_path}")
    sheet_name = _resolve_sheet_name(file_path)

    df = pd.read_excel(file_path, sheet_name=sheet_name)
    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")
    df["record_date"] = pd.to_datetime(df["record_date"], errors="coerce").dt.date

    skipped_zeros = 0
    for _, row in df.iterrows():
        record_date = row.get("record_date")
        if record_date is None or pd.isna(record_date) or record_date > cutoff_date:
            continue

        wholesale = _parse_positive_price(row.get("wholesale_price_per_kg"))
        retail = _parse_positive_price(row.get("retail_price_per_kg"))

        # Immediately skip rows with 0 or blank prices in Excel
        if wholesale is None or retail is None:
            skipped_zeros += 1
            continue

        records.append({
            "commodity": str(row["commodity"]).strip(),
            "wholesale_price_per_kg": wholesale,
            "retail_price_per_kg": retail,
            "record_date": record_date,
            "data_source": DATA_SOURCE,
        })

    print(f"Zero/blank rows skipped during extract: {skipped_zeros}")
    return records


# ============================================================
# TRANSFORM AND VALIDATE
# ============================================================

def transform_market_prices(records):
    transformed_records = []

    for record in records:

        raw_wholesale = record.get("wholesale_price_per_kg")
        raw_retail = record.get("retail_price_per_kg")

        # Skip empty cells (NaN)
        if pd.isna(raw_wholesale) or pd.isna(raw_retail):
            continue

        try:
            wholesale = Decimal(str(raw_wholesale))
            retail = Decimal(str(raw_retail))
        except Exception:
            continue

        # Skip zeros and negatives (treated as "missing data")
        if wholesale <= 0 or retail <= 0:
            continue

        # Sanity check: retail must be >= wholesale
        if retail < wholesale:
            continue

        transformed_records.append({
            "commodity": str(record["commodity"]).strip(),
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
    print()
    print("=" * 60)
    print("MARKET PRICE ETL PIPELINE (WEEKLY)")
    print("=" * 60)

    cutoff_date = get_last_completed_week()
    extracted_records = extract_seed_data(excel_path=excel_path)
    print(f"Valid non-zero records extracted: {len(extracted_records)}")

    transformed_records = transform_market_prices(extracted_records)
    print(f"Valid records after transform: {len(transformed_records)}")

    loaded_records = load_market_prices(transformed_records)

    print()
    print("=" * 60)
    print("MARKET PRICE ETL COMPLETED")
    print("=" * 60)
    print(f"Records loaded: {loaded_records}")
    return loaded_records


if __name__ == "__main__":
    run_market_price_etl()