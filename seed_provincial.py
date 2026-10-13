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


def seed_provincial_coordinators():
    db = SessionLocal()

    provincial_data = [
        {
            "first_name": "Maria",
            "last_name": "Santos",
            "username": "coord_nueva_ecija",
            "email_address": "maria.santos@provincial.gov.ph",
            "phone_number": "09171234567",
            "password": hash_password("ProvinceCoord123!"),
            "role": "Provincial Coordinator",
            "is_active": True
        },
        {
            "first_name": "Ricardo",
            "last_name": "Cruz",
            "username": "coord_bulacan",
            "email_address": "ricardo.cruz@provincial.gov.ph",
            "phone_number": "09281234568",
            "password": hash_password("ProvinceCoord123!"),
            "role": "Provincial Coordinator",
            "is_active": True
        },
        {
            "first_name": "Elena",
            "last_name": "Reyes",
            "username": "coord_pampanga",
            "email_address": "elena.reyes@provincial.gov.ph",
            "phone_number": "09451234569",
            "password": hash_password("ProvinceCoord123!"),
            "role": "Provincial Coordinator",
            "is_active": True
        },
        {
            "first_name": "Roberto",
            "last_name": "Fernandez",
            "username": "coord_tarlac",
            "email_address": "roberto.fernandez@provincial.gov.ph",
            "phone_number": "09561234570",
            "password": hash_password("ProvinceCoord123!"),
            "role": "Provincial Coordinator",
            "is_active": True
        },
        {
            "first_name": "Josephine",
            "last_name": "Mercado",
            "username": "coord_laguna",
            "email_address": "josephine.mercado@provincial.gov.ph",
            "phone_number": "09671234571",
            "password": hash_password("ProvinceCoord123!"),
            "role": "Provincial Coordinator",
            "is_active": True
        },
        {
            "first_name": "Antonio",
            "last_name": "Gutierrez",
            "username": "coord_quezon",
            "email_address": "antonio.gutierrez@provincial.gov.ph",
            "phone_number": "09781234572",
            "password": hash_password("ProvinceCoord123!"),
            "role": "Provincial Coordinator",
            "is_active": True
        }
    ]

    try:
        count_added = 0
        for data in provincial_data:
            existing = db.query(User).filter(
                User.username == data["username"]
            ).first()

            if not existing:
                user = User(**data)
                db.add(user)
                count_added += 1
                print(f"Added Provincial Coordinator: {data['first_name']} {data['last_name']} ({data['username']})")
            else:
                print(f"Provincial Coordinator already exists: {data['username']}")

        db.commit()
        print("\n" + "=" * 60)
        print(f"PROVINCIAL COORDINATORS SEED SUCCESSFUL! Added {count_added} new coordinator(s).")
        print("=" * 60)

    except Exception as e:
        print("\n" + "=" * 60)
        print("ERROR WHILE SEEDING PROVINCIAL COORDINATORS")
        print("=" * 60)
        print(e)
        db.rollback()

    finally:
        db.close()


if __name__ == "__main__":
    seed_provincial_coordinators()
