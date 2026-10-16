# seed_farmers.py
import sys
import os
import importlib
import pkgutil
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Auto-import all models to resolve SQLAlchemy relationships
try:
    import src.models as models_pkg
    for _, module_name, _ in pkgutil.iter_modules(models_pkg.__path__):
        importlib.import_module(f"src.models.{module_name}")
except Exception as err:
    print(f"Notice during models import: {err}")

from src.core.database import SessionLocal
from src.models.farmers import Farmer
from src.models.users import User


def seed_farmers():
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print("SEEDING FARMERS (15 farmers - 5 per AEW)")
        print("LOCATION: PAMPANGA")
        print("=" * 60)
        
        # Get AEWs for assignment
        aew_juan = db.query(User).filter(User.username == "aew_juan").first()
        aew_maria = db.query(User).filter(User.username == "aew_maria").first()
        aew_pedro = db.query(User).filter(User.username == "aew_pedro").first()
        
        aew_map = {
            "juan": aew_juan.user_id if aew_juan else None,
            "maria": aew_maria.user_id if aew_maria else None,
            "pedro": aew_pedro.user_id if aew_pedro else None
        }
        
        print(f"\n📋 AEWs found:")
        print(f"   Juan (ID: {aew_map['juan']})")
        print(f"   Maria (ID: {aew_map['maria']})")
        print(f"   Pedro (ID: {aew_map['pedro']})")
        
        farmers_data = [
            # ============================================================
            # Farmers for AEW Juan (5 farmers) - Pampanga
            # ============================================================
            {
                "rsbsa_id": "RSBSA-2024-001",
                "first_name": "Juan",
                "last_name": "Dela Cruz",
                "municipality": "San Fernando",
                "barangay": "Brgy. San Jose",
                "address": "Brgy. San Jose, San Fernando, Pampanga",
                "sex": "Male",
                "birthdate": datetime(1975, 6, 15).date(),
                "email_address": "juan.delacruz@example.com",
                "phone_number": "09123456789",
                "aew_id": aew_map["juan"]
            },
            {
                "rsbsa_id": "RSBSA-2024-002",
                "first_name": "Ramon",
                "last_name": "Reyes",
                "municipality": "Angeles City",
                "barangay": "Brgy. Balibago",
                "address": "Brgy. Balibago, Angeles City, Pampanga",
                "sex": "Male",
                "birthdate": datetime(1988, 1, 10).date(),
                "email_address": "ramon.reyes@example.com",
                "phone_number": "09345678901",
                "aew_id": aew_map["juan"]
            },
            {
                "rsbsa_id": "RSBSA-2024-003",
                "first_name": "Pedro",
                "last_name": "Cruz",
                "municipality": "Mexico",
                "barangay": "Brgy. San Roque",
                "address": "Brgy. San Roque, Mexico, Pampanga",
                "sex": "Male",
                "birthdate": datetime(1978, 3, 25).date(),
                "email_address": "pedro.cruz@example.com",
                "phone_number": "09567890123",
                "aew_id": aew_map["juan"]
            },
            {
                "rsbsa_id": "RSBSA-2024-004",
                "first_name": "Luz",
                "last_name": "Villanueva",
                "municipality": "Apalit",
                "barangay": "Brgy. San Isidro",
                "address": "Brgy. San Isidro, Apalit, Pampanga",
                "sex": "Female",
                "birthdate": datetime(1985, 11, 8).date(),
                "email_address": "luz.villanueva@example.com",
                "phone_number": "09678901234",
                "aew_id": aew_map["juan"]
            },
            {
                "rsbsa_id": "RSBSA-2024-005",
                "first_name": "Fernando",
                "last_name": "Garcia",
                "municipality": "Mabalacat",
                "barangay": "Brgy. San Francisco",
                "address": "Brgy. San Francisco, Mabalacat, Pampanga",
                "sex": "Male",
                "birthdate": datetime(1980, 7, 12).date(),
                "email_address": "fernando.garcia@example.com",
                "phone_number": "09789012345",
                "aew_id": aew_map["juan"]
            },
            
            # ============================================================
            # Farmers for AEW Maria (5 farmers) - Pampanga
            # ============================================================
            {
                "rsbsa_id": "RSBSA-2024-006",
                "first_name": "Maria",
                "last_name": "Santos",
                "municipality": "San Fernando",
                "barangay": "Brgy. San Juan",
                "address": "Brgy. San Juan, San Fernando, Pampanga",
                "sex": "Female",
                "birthdate": datetime(1982, 9, 20).date(),
                "email_address": "maria.santos@example.com",
                "phone_number": "09234567890",
                "aew_id": aew_map["maria"]
            },
            {
                "rsbsa_id": "RSBSA-2024-007",
                "first_name": "Elena",
                "last_name": "Gonzales",
                "municipality": "Angeles City",
                "barangay": "Brgy. San Agustin",
                "address": "Brgy. San Agustin, Angeles City, Pampanga",
                "sex": "Female",
                "birthdate": datetime(1990, 12, 5).date(),
                "email_address": "elena.gonzales@example.com",
                "phone_number": "09456789012",
                "aew_id": aew_map["maria"]
            },
            {
                "rsbsa_id": "RSBSA-2024-008",
                "first_name": "Ricardo",
                "last_name": "Mendoza",
                "municipality": "Guagua",
                "barangay": "Brgy. San Isidro",
                "address": "Brgy. San Isidro, Guagua, Pampanga",
                "sex": "Male",
                "birthdate": datetime(1976, 4, 18).date(),
                "email_address": "ricardo.mendoza@example.com",
                "phone_number": "09890123456",
                "aew_id": aew_map["maria"]
            },
            {
                "rsbsa_id": "RSBSA-2024-009",
                "first_name": "Cecilia",
                "last_name": "Fernandez",
                "municipality": "Santa Ana",
                "barangay": "Brgy. San Nicolas",
                "address": "Brgy. San Nicolas, Santa Ana, Pampanga",
                "sex": "Female",
                "birthdate": datetime(1987, 2, 28).date(),
                "email_address": "cecilia.fernandez@example.com",
                "phone_number": "09901234567",
                "aew_id": aew_map["maria"]
            },
            {
                "rsbsa_id": "RSBSA-2024-010",
                "first_name": "Andres",
                "last_name": "Aquino",
                "municipality": "Candaba",
                "barangay": "Brgy. San Fernando",
                "address": "Brgy. San Fernando, Candaba, Pampanga",
                "sex": "Male",
                "birthdate": datetime(1972, 8, 22).date(),
                "email_address": "andres.aquino@example.com",
                "phone_number": "09912345678",
                "aew_id": aew_map["maria"]
            },
            
            # ============================================================
            # Farmers for AEW Pedro (5 farmers) - Pampanga
            # ============================================================
            {
                "rsbsa_id": "RSBSA-2024-011",
                "first_name": "Jose",
                "last_name": "Reyes",
                "municipality": "Mabalacat",
                "barangay": "Brgy. San Vicente",
                "address": "Brgy. San Vicente, Mabalacat, Pampanga",
                "sex": "Male",
                "birthdate": datetime(1979, 5, 15).date(),
                "email_address": "jose.reyes@example.com",
                "phone_number": "09456789012",
                "aew_id": aew_map["pedro"]
            },
            {
                "rsbsa_id": "RSBSA-2024-012",
                "first_name": "Teresa",
                "last_name": "Mercado",
                "municipality": "Apalit",
                "barangay": "Brgy. San Miguel",
                "address": "Brgy. San Miguel, Apalit, Pampanga",
                "sex": "Female",
                "birthdate": datetime(1983, 11, 30).date(),
                "email_address": "teresa.mercado@example.com",
                "phone_number": "09567890123",
                "aew_id": aew_map["pedro"]
            },
            {
                "rsbsa_id": "RSBSA-2024-013",
                "first_name": "Rogelio",
                "last_name": "Dimaano",
                "municipality": "Mexico",
                "barangay": "Brgy. San Jose",
                "address": "Brgy. San Jose, Mexico, Pampanga",
                "sex": "Male",
                "birthdate": datetime(1974, 9, 8).date(),
                "email_address": "rogelio.dimaano@example.com",
                "phone_number": "09678901234",
                "aew_id": aew_map["pedro"]
            },
            {
                "rsbsa_id": "RSBSA-2024-014",
                "first_name": "Luzviminda",
                "last_name": "Pascual",
                "municipality": "Macabebe",
                "barangay": "Brgy. San Juan",
                "address": "Brgy. San Juan, Macabebe, Pampanga",
                "sex": "Female",
                "birthdate": datetime(1989, 4, 12).date(),
                "email_address": "luzviminda.pascual@example.com",
                "phone_number": "09789012345",
                "aew_id": aew_map["pedro"]
            },
            {
                "rsbsa_id": "RSBSA-2024-015",
                "first_name": "Gregorio",
                "last_name": "Fernandez",
                "municipality": "Lubao",
                "barangay": "Brgy. San Isidro",
                "address": "Brgy. San Isidro, Lubao, Pampanga",
                "sex": "Male",
                "birthdate": datetime(1977, 7, 20).date(),
                "email_address": "gregorio.fernandez@example.com",
                "phone_number": "09890123456",
                "aew_id": aew_map["pedro"]
            }
        ]
        
        created_count = 0
        skipped_count = 0
        
        for farmer_data in farmers_data:
            existing = db.query(Farmer).filter(
                Farmer.rsbsa_id == farmer_data["rsbsa_id"]
            ).first()
            
            if existing:
                print(f"⏭️ Farmer {farmer_data['rsbsa_id']} already exists.")
                skipped_count += 1
                continue
            
            farmer = Farmer(**farmer_data)
            db.add(farmer)
            created_count += 1
            
            aew_name = "Unknown"
            if farmer_data["aew_id"] == aew_map["juan"]:
                aew_name = "Juan"
            elif farmer_data["aew_id"] == aew_map["maria"]:
                aew_name = "Maria"
            elif farmer_data["aew_id"] == aew_map["pedro"]:
                aew_name = "Pedro"
            
            print(f"✅ Created farmer: {farmer_data['first_name']} {farmer_data['last_name']} → AEW {aew_name} ({farmer_data['municipality']})")
        
        db.commit()
        
        print("\n" + "=" * 60)
        print("✅ SEED COMPLETE")
        print("=" * 60)
        print(f"   Created: {created_count} farmers")
        print(f"   Skipped: {skipped_count} farmers (already exist)")
        print("\n📊 Summary by AEW:")
        
        for aew in [aew_juan, aew_maria, aew_pedro]:
            if aew:
                count = db.query(Farmer).filter(Farmer.aew_id == aew.user_id).count()
                print(f"   {aew.first_name} {aew.last_name}: {count} farmers")
        
        print("\n📋 AEW Credentials:")
        print("-" * 60)
        if aew_juan:
            print(f"   aew_juan   | SecureAEW123!  | {aew_juan.first_name} {aew_juan.last_name}")
        if aew_maria:
            print(f"   aew_maria  | SecureAEW123!  | {aew_maria.first_name} {aew_maria.last_name}")
        if aew_pedro:
            print(f"   aew_pedro  | SecureAEW123!  | {aew_pedro.first_name} {aew_pedro.last_name}")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_farmers()