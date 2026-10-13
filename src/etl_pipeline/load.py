from sqlalchemy.orm import Session

from src.core.database import SessionLocal
from src.models.price_data import PriceData


def load_price_data(records):

    db: Session = SessionLocal()

    try:

        inserted_count = 0
        updated_count = 0
        skipped_count = 0

        for record in records:

            # ====================================================
            # VALIDATE PRICE
            # ====================================================

            price = record.get("price_per_kg")

            # Skip missing price
            if price is None:
                skipped_count += 1
                continue

            # Skip zero or negative price
            if float(price) <= 0:
                skipped_count += 1
                continue

            # ====================================================
            # CHECK EXISTING RECORD
            # ====================================================

            existing_record = (
                db.query(PriceData)
                .filter(
                    PriceData.commodity == record["commodity"],
                    PriceData.record_date == record["record_date"],
                )
                .first()
            )

            # ====================================================
            # UPDATE EXISTING
            # ====================================================

            if existing_record:

                existing_record.price_per_kg = price

                updated_count += 1

            # ====================================================
            # INSERT NEW
            # ====================================================

            else:

                price_data = PriceData(
                    commodity=record["commodity"],
                    price_per_kg=price,
                    record_date=record["record_date"],
                )

                db.add(price_data)

                inserted_count += 1

        # ========================================================
        # COMMIT
        # ========================================================

        db.commit()

        print(f"New records inserted: {inserted_count}")
        print(f"Existing records updated: {updated_count}")
        print(f"Invalid/zero records skipped: {skipped_count}")

        return inserted_count + updated_count

    except Exception:

        db.rollback()

        raise

    finally:

        db.close()
