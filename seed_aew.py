import sys
import os
import importlib
import pkgutil

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Auto-import all models to resolve SQLAlchemy relationships
try:
    import src.models as models_pkg
    for _, module_name, _ in pkgutil.iter_modules(models_pkg.__path__):
        importlib.import_module(f"src.models.{module_name}")
except Exception as err:
    print(f"Notice during models import: {err}")

from src.core.database import SessionLocal
from src.models.users import User
from src.core.security import hash_password


def seed_aew():
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print("SEEDING AEW ACCOUNTS (3 AEWs)")
        print("=" * 60)
        
        aew_users = [
            {
                "first_name": "Juan",
                "last_name": "Dela Cruz",
                "username": "aew_juan",
                "email_address": "juan.delacruz@esaka.gov.ph",
                "phone_number": "09123456789",
                "password": hash_password("SecureAEW123!"),
                "role": "Agricultural Extension Worker",
                "is_active": True
            },
            {
                "first_name": "Maria",
                "last_name": "Santos",
                "username": "aew_maria",
                "email_address": "maria.santos@esaka.gov.ph",
                "phone_number": "09234567890",
                "password": hash_password("SecureAEW123!"),
                "role": "Agricultural Extension Worker",
                "is_active": True
            },
            {
                "first_name": "Pedro",
                "last_name": "Reyes",
                "username": "aew_pedro",
                "email_address": "pedro.reyes@esaka.gov.ph",
                "phone_number": "09345678901",
                "password": hash_password("SecureAEW123!"),
                "role": "Agricultural Extension Worker",
                "is_active": True
            }
        ]
        
        created_count = 0
        skipped_count = 0
        
        for aew_data in aew_users:
            existing = db.query(User).filter(
                User.username == aew_data["username"]
            ).first()
            
            if existing:
                print(f"⏭️ AEW {aew_data['username']} already exists.")
                skipped_count += 1
                continue
            
            aew = User(**aew_data)
            db.add(aew)
            created_count += 1
            print(f"✅ Created AEW: {aew_data['first_name']} {aew_data['last_name']} ({aew_data['username']})")
        
        db.commit()
        
        print("\n" + "=" * 60)
        print("✅ SEED COMPLETE")
        print("=" * 60)
        print(f"   Created: {created_count} AEW accounts")
        print(f"   Skipped: {skipped_count} (already exist)")
        print("\n📋 AEW CREDENTIALS:")
        print("-" * 60)
        for aew in aew_users:
            print(f"   Username: {aew['username']}")
            print(f"   Password: SecureAEW123!")
            print(f"   Role: {aew['role']}")
            print()
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_aew()
