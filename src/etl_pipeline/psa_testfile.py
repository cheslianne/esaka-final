from datetime import date
from decimal import Decimal
import re
import requests

from .load import load_price_data


# ============================================================
# PSA OPENSTAT API
# ============================================================

API_URL = (
    "https://openstat.psa.gov.ph:443/"
    "PXWeb/api/v1/en/DB/2M/NFG/0032M4AFN05.px"
)

# Region III - Pampanga
GEOLOCATION_CODE = "25"

COMMODITIES = {
    "Tomato": "13",
    "Squash fruit": "12"
}

YEARS = {
    2024: "14",
    2025: "15",
    2026: "16"
}

PERIOD_CODES = [
    "0", "1", "2", "3",
    "4", "5", "6", "7",
    "8", "9", "10", "11"
]

MONTHS = [
    1, 2, 3, 4, 5, 6,
    7, 8, 9, 10, 11, 12
]


# ============================================================
# FETCH PSA DATA FOR ONE COMMODITY + ONE YEAR
# ============================================================

def fetch_psa_data(
    commodity_name,
    commodity_code,
    year,
    year_code
):
    query = {
        "query": [
            {
                "code": "Geolocation",
                "selection": {
                    "filter": "item",
                    "values": [GEOLOCATION_CODE]
                }
            },
            {
                "code": "Commodity",
                "selection": {
                    "filter": "item",
                    "values": [commodity_code]
                }
            },
            {
                "code": "Year",
                "selection": {
                    "filter": "item",
                    "values": [year_code]
                }
            },
            {
                "code": "Period",
                "selection": {
                    "filter": "item",
                    "values": PERIOD_CODES
                }
            }
        ],
        "response": {
            "format": "px"
        }
    }

    print()
    print("=" * 60)
    print(f"FETCHING PSA FARMGATE DATA - {commodity_name} - {year}")
    print("=" * 60)

    try:
        response = requests.post(
            API_URL,
            json=query,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Content-Type": "application/json"
            },
            timeout=30
        )
    except requests.RequestException as error:
        print("PSA API CONNECTION ERROR:")
        print(error)
        return []

    print("STATUS CODE:", response.status_code)

    if response.status_code != 200:
        print("PSA API ERROR:")
        print(response.text)
        return []

    px_text = response.text

    commodity_match = re.search(
        r'VALUES\("Commodity"\)="([^"]+)";',
        px_text
    )
    if commodity_match:
        commodity = commodity_match.group(1)
    else:
        commodity = commodity_name

    data_match = re.search(
        r'DATA=\s*(.*?)\s*;',
        px_text,
        re.DOTALL
    )
    if not data_match:
        print("No DATA section found.")
        return []

    data_line = data_match.group(1).strip().replace("\n", " ").strip()
    values = data_line.split()

    print(f"Commodity: {commodity}")
    print(f"Year: {year}")
    print(f"Values returned: {len(values)}")
    print()
    print("RAW PSA DATA:")
    print(data_line)

    records = []

    for month, value in zip(MONTHS, values):
        value = value.replace('"', "").strip()

        if not value or value in ("..", "-", "NA", "N/A"):
            print(f"{year}-{month:02d}: MISSING - skipped")
            continue

        try:
            price = Decimal(value)
        except Exception:
            print(f"{year}-{month:02d}: INVALID VALUE - {value}")
            continue

        if price <= Decimal("0"):
            print(f"{year}-{month:02d}: ZERO / NO DATA - skipped")
            continue

        records.append({
            "commodity": commodity,
            "price_per_kg": price,
            "record_date": date(year, month, 1)
        })

    return records


# ============================================================
# MAIN
# ============================================================

def main():
    all_records = []

    for commodity_name, commodity_code in COMMODITIES.items():
        print()
        print("=" * 60)
        print(f"PROCESSING COMMODITY: {commodity_name}")
        print("=" * 60)

        for year, year_code in YEARS.items():
            records = fetch_psa_data(
                commodity_name,
                commodity_code,
                year,
                year_code
            )
            all_records.extend(records)

    print()
    print("=" * 60)
    print("PSA FARMGATE DATA - PAMPANGA")
    print("=" * 60)
    print(f"Total valid records fetched: {len(all_records)}")
    print()

    for record in all_records:
        print(
            f"{record['record_date']} | "
            f"{record['commodity']} | "
            f"PHP {record['price_per_kg']}/kg"
        )

    if not all_records:
        print()
        print("No valid records to load.")
        return 0

    print()
    print("=" * 60)
    print("LOADING TO DATABASE")
    print("=" * 60)

    try:
        loaded = load_price_data(all_records)
        print()
        print(f"Records loaded: {loaded}")
        return loaded
    except Exception as error:
        print()
        print("DATABASE LOAD ERROR:")
        print(error)
        return 0


if __name__ == "__main__":
    main()