from sqlalchemy.orm import Session

from src.core.database import SessionLocal
from src.models.market_price import MarketPrice


def load_market_prices(records):

    db: Session = SessionLocal()

    try:
        inserted_count = 0
        updated_count = 0
        skipped_count = 0

        for record in records:

            # ====================================================
            # GET VALUES
            # ====================================================

            commodity = record.get("commodity")
            wholesale_price = record.get(
                "wholesale_price_per_kg"
            )
            retail_price = record.get(
                "retail_price_per_kg"
            )
            record_date = record.get("record_date")
            data_source = record.get(
                "data_source",
                "SEED_DATA"
            )

            # ====================================================
            # VALIDATE REQUIRED FIELDS
            # ====================================================

            if not commodity:
                skipped_count += 1
                continue

            if wholesale_price is None:
                skipped_count += 1
                continue

            if retail_price is None:
                skipped_count += 1
                continue

            if not record_date:
                skipped_count += 1
                continue

            # ====================================================
            # VALIDATE PRICES
            # ====================================================

            if float(wholesale_price) <= 0:
                skipped_count += 1
                continue

            if float(retail_price) <= 0:
                skipped_count += 1
                continue

            # ====================================================
            # CHECK EXISTING RECORD
            # ====================================================

            existing_record = (
                db.query(MarketPrice)
                .filter(
                    MarketPrice.commodity == commodity,
                    MarketPrice.record_date == record_date,
                    MarketPrice.data_source == data_source
                )
                .first()
            )

            # ====================================================
            # UPDATE EXISTING
            # ====================================================

            if existing_record:

                existing_record.wholesale_price_per_kg = (
                    wholesale_price
                )

                existing_record.retail_price_per_kg = (
                    retail_price
                )

                updated_count += 1

            # ====================================================
            # INSERT NEW
            # ====================================================

            else:

                market_price = MarketPrice(
                    commodity=commodity,
                    wholesale_price_per_kg=wholesale_price,
                    retail_price_per_kg=retail_price,
                    record_date=record_date,
                    data_source=data_source
                )

                db.add(market_price)

                inserted_count += 1

        db.commit()

        print()
        print("=" * 60)
        print("MARKET PRICE LOAD SUMMARY")
        print("=" * 60)
        print(f"New records inserted: {inserted_count}")
        print(f"Existing records updated: {updated_count}")
        print(f"Invalid records skipped: {skipped_count}")

        return inserted_count + updated_count

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()