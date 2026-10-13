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


def seed_municipal_coordinators():
    db = SessionLocal()

    municipal_data = [
        # Nueva Ecija
        {
            "first_name": "Roberto",
            "last_name": "Villanueva",
            "username": "mcoord_san_jose_city",
            "email_address": "rvillanueva@sanjosecity.gov.ph",
            "phone_number": "09123456789",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Maria",
            "last_name": "Santos",
            "username": "mcoord_cabanatuan_city",
            "email_address": "msantos@cabanatuan.gov.ph",
            "phone_number": "09234567890",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Juan",
            "last_name": "Reyes",
            "username": "mcoord_guimba",
            "email_address": "jreyes@guimba.gov.ph",
            "phone_number": "09345678901",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Rosa",
            "last_name": "Garcia",
            "username": "mcoord_taluban",
            "email_address": "rgarcia@taluban.gov.ph",
            "phone_number": "09456789012",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Miguel",
            "last_name": "Fernandez",
            "username": "mcoord_penaranda",
            "email_address": "mfernandez@penaranda.gov.ph",
            "phone_number": "09567890123",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        # Bulacan
        {
            "first_name": "Antonio",
            "last_name": "Cruz",
            "username": "mcoord_meycauayan",
            "email_address": "acruz@meycauayan.gov.ph",
            "phone_number": "09678901234",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Lucia",
            "last_name": "Mercado",
            "username": "mcoord_marilao",
            "email_address": "lmercado@marilao.gov.ph",
            "phone_number": "09789012345",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Fernando",
            "last_name": "Dela Cruz",
            "username": "mcoord_obando",
            "email_address": "fdelacruz@obando.gov.ph",
            "phone_number": "09890123456",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Patricia",
            "last_name": "Aquino",
            "username": "mcoord_valenzuela",
            "email_address": "paquino@valenzuela.gov.ph",
            "phone_number": "09901234567",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        # Pampanga
        {
            "first_name": "Carlos",
            "last_name": "Gonzales",
            "username": "mcoord_san_fernando",
            "email_address": "cgonzales@sanfernando.gov.ph",
            "phone_number": "09121567890",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Elena",
            "last_name": "Morales",
            "username": "mcoord_angeles_city",
            "email_address": "emorales@angeles.gov.ph",
            "phone_number": "09232567890",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Rafael",
            "last_name": "Diaz",
            "username": "mcoord_floridablanca",
            "email_address": "rdiaz@floridablanca.gov.ph",
            "phone_number": "09343567890",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Isabel",
            "last_name": "Reyes",
            "username": "mcoord_apalit",
            "email_address": "ireyes@apalit.gov.ph",
            "phone_number": "09177778888",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        # Tarlac
        {
            "first_name": "Ricardo",
            "last_name": "Bautista",
            "username": "mcoord_tarlac_city",
            "email_address": "rbautista@tarlac.gov.ph",
            "phone_number": "09454567890",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Veronica",
            "last_name": "Laguio",
            "username": "mcoord_capas",
            "email_address": "vlaguio@capas.gov.ph",
            "phone_number": "09565567890",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        # Laguna
        {
            "first_name": "Salvador",
            "last_name": "Castillo",
            "username": "mcoord_santa_rosa",
            "email_address": "scastillo@santarosa.gov.ph",
            "phone_number": "09676567890",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Diana",
            "last_name": "Ramos",
            "username": "mcoord_binan",
            "email_address": "dramos@binan.gov.ph",
            "phone_number": "09787567890",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        },
        {
            "first_name": "Esteban",
            "last_name": "Ruiz",
            "username": "mcoord_pangil",
            "email_address": "eruiz@pangil.gov.ph",
            "phone_number": "09898567890",
            "password": hash_password("MunicipalCoord@2024"),
            "role": "Municipal Coordinator",
            "is_active": True
        }
    ]

    try:
        count_added = 0
        for data in municipal_data:
            existing = db.query(User).filter(
                (User.username == data["username"]) |
                (User.email_address == data["email_address"])
            ).first()

            if not existing:
                user = User(**data)
                db.add(user)
                count_added += 1
                print(f"Added Municipal Coordinator: {data['first_name']} {data['last_name']} ({data['username']})")
            else:
                print(f"Municipal Coordinator already exists: {data['username']}")

        db.commit()
        print("\n" + "=" * 60)
        print(f"MUNICIPAL COORDINATORS SEED SUCCESSFUL! Added {count_added} new coordinator(s).")
        print("=" * 60)

    except Exception as e:
        print("\n" + "=" * 60)
        print("ERROR WHILE SEEDING MUNICIPAL COORDINATORS")
        print("=" * 60)
        print(e)
        db.rollback()

    finally:
        db.close()


if __name__ == "__main__":
    seed_municipal_coordinators()
