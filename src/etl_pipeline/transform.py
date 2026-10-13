from decimal import Decimal
from datetime import date


def transform_price_data(records):
    transformed_records = []

    for record in records:
        transformed_record = {
            "commodity": record["commodity"].strip(),
            "price_per_kg": Decimal(record["price_per_kg"]),
            "record_date": date.fromisoformat(record["record_date"]),
        }

        transformed_records.append(transformed_record)

    return transformed_records