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

from src.core.database import SessionLocal
from src.models.users import User

from src.core.security import hash_password


def create_admin():
    db = SessionLocal()

    try:
        # ============================================================
        # SYSTEM ADMIN 1
        # ============================================================

        admin1 = db.query(User).filter(
            User.username == "admin"
        ).first()

        if admin1:
            print("Admin 1 already exists!")
        else:
            admin1 = User(
                first_name="Admin",
                last_name="User",
                username="admin",
                email_address="admin@esaka.gov.ph",
                phone_number="09123456789",
                password=hash_password("SecurePassword123!"),
                role="System Administrator",
                is_active=True
            )

            db.add(admin1)
            print("Admin 1 created!")


        # ============================================================
        # SYSTEM ADMIN 2
        # ============================================================

        admin2 = db.query(User).filter(
            User.username == "admin2"
        ).first()

        if admin2:
            print("Admin 2 already exists!")
        else:
            admin2 = User(
                first_name="System",
                last_name="Administrator",
                username="admin2",
                email_address="admin2@esaka.gov.ph",
                phone_number="09123456788",
                password=hash_password("SecureAdmin456!"),
                role="System Administrator",
                is_active=True
            )

            db.add(admin2)
            print("Admin 2 created!")


        # ============================================================
        # SAVE CHANGES
        # ============================================================

        db.commit()

        print()
        print("=" * 60)
        print("SYSTEM ADMIN ACCOUNTS")
        print("=" * 60)

        print()
        print("ADMIN 1")
        print("-" * 60)
        print("Username : admin")
        print("Password : SecurePassword123!")
        print("Role     : System Administrator")

        print()
        print("ADMIN 2")
        print("-" * 60)
        print("Username : admin2")
        print("Password : SecureAdmin456!")
        print("Role     : System Administrator")

        print()
        print("=" * 60)
        print("SEED COMPLETED SUCCESSFULLY")
        print("=" * 60)


    except Exception as e:
        print()
        print("=" * 60)
        print("ERROR WHILE CREATING SYSTEM ADMINS")
        print("=" * 60)
        print(e)

        db.rollback()

    finally:
        db.close()


if __name__ == "__main__":
 create_admin() 
