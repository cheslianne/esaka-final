import sys
import os
import importlib
import pkgutil


# Add project root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# Auto-import all models to resolve SQLAlchemy relationships
try:
    import src.models as models_pkg
    for _, module_name, _ in pkgutil.iter_modules(models_pkg.__path__):
        importlib.import_module(f"src.models.{module_name}")
except Exception as err:
    print(f"Notice during models import: {err}")


from src.core.database import SessionLocal, engine, Base
from src.models.buyers import Buyer


Base.metadata.create_all(bind=engine)




def seed_buyers():
    db = SessionLocal()


    buyers_sample = [
        {
            "buyer_name": "AgriTrade Food Corp.",
            "location": "Sta. Monica Trading Post, San Jose City",
            "phone_number": "09171234567",
            "email_address": "procurement@agritrade.ph"
        },
        {
            "buyer_name": "Mega Harvest Wholesalers",
            "location": "Divisoria Commercial Complex, Manila",
            "phone_number": "09189876543",
            "email_address": "orders@megaharvest.com"
        },
        {
            "buyer_name": "Central Luzon Supermarkets Inc.",
            "location": "City of San Fernando, Pampanga",
            "phone_number": "09225557890",
            "email_address": "supplychain@cls-inc.com"
        },
        {
            "buyer_name": "Fresh Produce Cooperative Hub",
            "location": "Cabanatuan Central Terminal, Nueva Ecija",
            "phone_number": "09334441122",
            "email_address": "contact@freshproducehub.org"
        },
        {
            "buyer_name": "San Jose Onion & Garlic Trading",
            "location": "Maharlika Highway, San Jose City",
            "phone_number": "09998887766",
            "email_address": "sjoniontrading@gmail.com"
        }
    ]


    try:
        count_added = 0
        for data in buyers_sample:
            existing = db.query(Buyer).filter(
                (Buyer.buyer_name == data["buyer_name"]) |
                (Buyer.email_address == data["email_address"])
            ).first()


            if not existing:
                buyer = Buyer(**data)
                db.add(buyer)
                count_added += 1
                print(f"Added Buyer: {data['buyer_name']} ({data['location']})")
            else:
                print(f"Buyer already exists: {data['buyer_name']}")


        db.commit()
        print("\n" + "=" * 60)
        print(f"BUYERS SEEDED SUCCESSFULLY! Added {count_added} new buyer(s).")
        print("=" * 60)


    except Exception as e:
        print("\n" + "=" * 60)
        print("ERROR WHILE SEEDING BUYERS")
        print("=" * 60)
        print(e)
        db.rollback()


    finally:
        db.close()




if __name__ == "__main__":
    seed_buyers()

