# seed_planting_intents.py
import sys
import os
import importlib
import pkgutil
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Auto-import all models to resolve SQLAlchemy relationships
try:
    import src.models as models_pkg
    for _, module_name, _ in pkgutil.iter_modules(models_pkg.__path__):
        importlib.import_module(f"src.models.{module_name}")
except Exception as err:
    print(f"Notice during models import: {err}")

from src.core.database import SessionLocal
from src.models.planting_intents import PlantingIntent
from src.models.farmers import Farmer
from sqlalchemy import func


def seed_planting_intents():
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print("SEEDING PLANTING INTENTS")
        print("=" * 60)
        
        # Get all farmers
        farmers = db.query(Farmer).all()
        
        if not farmers:
            print("❌ No farmers found. Run seed_farmers.py first.")
            return
        
        print(f"\n📋 Found {len(farmers)} farmers")
        
        # Define crops for each farmer
        crops = [
            "Red Onion", "White Onion", "Tomato", "Eggplant", 
            "Yellow Corn", "Squash", "Garlic", "String Beans",
            "Cabbage", "Pepper", "Papaya", "Mango", "Banana"
        ]
        
        planting_intents_data = []
        
        # Create planting intents for each farmer (2-3 per farmer)
        for i, farmer in enumerate(farmers):
            # Each farmer gets 2-3 planting intents
            num_intents = 2 if i % 2 == 0 else 3
            
            for j in range(num_intents):
                crop_index = (i + j) % len(crops)
                commodity = crops[crop_index]
                
                # Random dates within 2026
                base_date = datetime(2026, 8, 1) + timedelta(days=i * 3 + j * 5)
                planting_date = base_date
                harvest_date = planting_date + timedelta(days=60 + (i % 30))
                
                # Random volume between 500 and 15000 kg
                import random
                volume = random.randint(500, 15000)
                
                # Remarks
                remarks_list = [
                    "Targeting central trading post",
                    "For local market",
                    "Contract with buyer",
                    "For fiesta season",
                    "For export quality",
                    "Organic farming",
                    "High yield variety"
                ]
                remarks = remarks_list[(i + j) % len(remarks_list)]
                
                # ✅ REMOVED: 'status' field
                planting_intents_data.append({
                    "farmer_id": farmer.farmer_id,
                    "commodity": commodity,
                    "planting_date": planting_date,
                    "harvest_date": harvest_date,
                    "volume": volume,
                    "remarks": f"{remarks} - {farmer.first_name} {farmer.last_name}"
                })
        
        # Count existing intents to avoid duplicates
        existing_count = db.query(PlantingIntent).count()
        if existing_count > 0:
            print(f"\n⚠️ Found {existing_count} existing planting intents.")
            try:
                confirm = input("Delete existing planting intents? (yes/no): ")
            except EOFError:
                # non-interactive environment (e.g. container deploy) - skip re-seeding
                confirm = "no"
            if confirm.lower() == "yes":
                db.query(PlantingIntent).delete()
                db.commit()
                print("✅ Existing planting intents deleted.")
            else:
                print("❌ Cancelled. Please run again.")
                return
        
        # Insert planting intents
        created_count = 0
        for data in planting_intents_data:
            intent = PlantingIntent(**data)
            db.add(intent)
            created_count += 1
            
            # Progress indicator
            if created_count % 5 == 0:
                print(f"   Created {created_count} planting intents...")
        
        db.commit()
        
        print("\n" + "=" * 60)
        print("✅ SEED COMPLETE")
        print("=" * 60)
        print(f"   Created: {created_count} planting intents")
        print(f"   Farmers: {len(farmers)} farmers")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_planting_intents()