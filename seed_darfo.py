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
from src.models.users import User
from src.core.security import hash_password

Base.metadata.create_all(bind=engine)


def seed_da_officers():
    db = SessionLocal()

    da_officers = [
        {
            "first_name": "Ramon",
            "last_name": "Dela Cruz",
            "username": "daofficer_ramon_delacruz",
            "email_address": "ramon.delacruz@da.gov.ph",
            "phone_number": "09171234001",
            "password": hash_password("DAOfficer123!"),
            "role": "DA-RFO Officer",
            "is_active": True
        },
        {
            "first_name": "Liza",
            "last_name": "Mendoza",
            "username": "daofficer_liza_mendoza",
            "email_address": "liza.mendoza@da.gov.ph",
            "phone_number": "09181234002",
            "password": hash_password("DAOfficer123!"),
            "role": "DA-RFO Officer",
            "is_active": True
        },
        {
            "first_name": "Edgar",
            "last_name": "Santos",
            "username": "daofficer_edgar_santos",
            "email_address": "edgar.santos@da.gov.ph",
            "phone_number": "09191234003",
            "password": hash_password("DAOfficer123!"),
            "role": "DA-RFO Officer",
            "is_active": True
        },
        {
            "first_name": "Maricel",
            "last_name": "Reyes",
            "username": "daofficer_maricel_reyes",
            "email_address": "maricel.reyes@da.gov.ph",
            "phone_number": "09201234004",
            "password": hash_password("DAOfficer123!"),
            "role": "DA-RFO Officer",
            "is_active": True
        },
        {
            "first_name": "Jovito",
            "last_name": "Garcia",
            "username": "daofficer_jovito_garcia",
            "email_address": "jovito.garcia@da.gov.ph",
            "phone_number": "09211234005",
            "password": hash_password("DAOfficer123!"),
            "role": "DA-RFO Officer",
            "is_active": True
        }
    ]

    try:
        count_added = 0
        for data in da_officers:
            existing = db.query(User).filter(
                (User.username == data["username"]) |
                (User.email_address == data["email_address"])
            ).first()

            if not existing:
                user = User(**data)
                db.add(user)
                count_added += 1
                print(f"Added DA-RFO Officer: {data['first_name']} {data['last_name']} ({data['username']})")
            else:
                print(f"DA-RFO Officer already exists: {data['username']}")

        db.commit()
        print("\n" + "=" * 60)
        print(f"DA-RFO OFFICERS SEED SUCCESSFUL! Added {count_added} new officer(s).")
        print("=" * 60)

    except Exception as e:
        print("\n" + "=" * 60)
        print("ERROR WHILE SEEDING DA-RFO OFFICERS")
        print("=" * 60)
        print(e)
        db.rollback()

    finally:
        db.close()


if __name__ == "__main__":
    seed_da_officers()
