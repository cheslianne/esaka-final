import csv
from datetime import datetime
from io import StringIO
import requests

from src.etl_pipeline.load import load_price_data


# ============================================================
# PSA API
# ============================================================

API_URL = (
    "https://openstat.psa.gov.ph:443/"
    "PXWeb/api/v1/en/DB/2M/NFG/0032M4AFN04.px"
)


# ============================================================
# PSA SELECTION
# ============================================================

REGION_CODE = "20"       # REGION III (CENTRAL LUZON)
COMMODITY_CODE = "6"     # Onion, red creole (Bermuda red)
YEARS = ["14", "15", "16"]  # 2024, 2025, 2026

PERIODS = [
    "0", "1", "2", "3", "4", "5",
    "6", "7", "8", "9", "10", "11"
]


# ============================================================
# FETCH + CLEAN PSA DATA
# ============================================================

def fetch_red_onion_data():
    payload = {
        "query": [
            {
                "code": "Geolocation",
                "selection": {
                    "filter": "item",
                    "values": [REGION_CODE]
                }
            },
            {
                "code": "Commodity",
                "selection": {
                    "filter": "item",
                    "values": [COMMODITY_CODE]
                }
            },
            {
                "code": "Year",
                "selection": {
                    "filter": "item",
                    "values": YEARS
                }
            },
            {
                "code": "Period",
                "selection": {
                    "filter": "item",
                    "values": PERIODS
                }
            }
        ],
        "response": {
            "format": "csv"
        }
    }

    response = requests.post(
        API_URL,
        json=payload,
        timeout=60
    )

    print("STATUS CODE:", response.status_code)
    print()

    response.raise_for_status()

    csv_data = StringIO(response.text)
    reader = csv.reader(csv_data)
    rows = list(reader)

    headers = rows[0]
    values = rows[1]

    records = []

    for header, value in zip(headers[2:], values[2:]):
        cleaned = str(value).strip().replace('"', "")
        if cleaned in ("..", "", "NA", "N/A", "-"):
            continue

        try:
            price = float(cleaned)
        except ValueError:
            continue

        if price <= 0:
            continue

        record_date = datetime.strptime(
            header.strip(),
            "%Y %B"
        ).date()

        records.append({
            "commodity": "Red Onion",
            "price_per_kg": price,
            "record_date": record_date
        })

    return records


# ============================================================
# MAIN ETL
# ============================================================

def main():
    print("=" * 70)
    print("PSA RED ONION ETL - REGION III")
    print("=" * 70)
    print()
    print("Commodity: Red Onion")
    print("Geolocation: Region III (Central Luzon)")
    print("Years: 2024, 2025, 2026")
    print()
    print("FETCHING PSA DATA...")
    print()

    try:
        records = fetch_red_onion_data()

        print("VALID OBSERVATIONS:", len(records))
        print()

        if not records:
            print("No valid Red Onion observations found.")
            return 0

        print("CLEAN DATA")
        print("-" * 70)

        for record in records:
            print(
                f"{record['record_date']} | "
                f"{record['commodity']:<12} | "
                f"PHP {record['price_per_kg']:,.2f}/kg"
            )

        print("-" * 70)
        print()
        print("LOADING TO DATABASE...")
        print()

        loaded_count = load_price_data(records)

        print()
        print("=" * 70)
        print("RED ONION ETL COMPLETE")
        print("=" * 70)
        print(f"Valid PSA observations: {len(records)}")
        print(f"Database records processed: {loaded_count}")
        return loaded_count

    except requests.exceptions.RequestException as e:
        print("PSA API ERROR:")
        print(e)
        return 0

    except Exception as e:
        print("ETL ERROR:")
        print(e)
        return 0


if __name__ == "__main__":
    main()