import csv
from pathlib import Path

from .transform import transform_price_data
from .load import load_price_data


def extract_price_data():
    csv_path = Path(__file__).parent / "seed" / "price_data.csv"

    records = []

    with open(csv_path, mode="r", encoding="utf-8") as file:
        reader = csv.DictReader(file)

        for row in reader:
            records.append(row)

    return records


if __name__ == "__main__":
    data = extract_price_data()

    print("ETL EXTRACT + TRANSFORM TEST")
    print(f"Records extracted: {len(data)}")

    transformed_data = transform_price_data(data)

    print(f"Records transformed: {len(transformed_data)}")

    for record in transformed_data:
        print(record)

    loaded_count = load_price_data(transformed_data)

    print(f"Records loaded: {loaded_count}")