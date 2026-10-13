# assign_aew.py

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.core.database import SessionLocal
from src.models.users import User
from src.models.farmers import Farmer
from sqlalchemy import text

def assign_aew():
    db = SessionLocal()
    
    try:
        # Get all AEWs
        aews = db.execute(text("SELECT user_id, username, first_name, last_name FROM users WHERE role = 'Agricultural Extension Worker'")).fetchall()
        
        if not aews:
            print("❌ No AEWs found!")
            return
        
        print("📋 AEWs found:")
        for aew in aews:
            print(f"   ID: {aew[0]}, {aew[1]} - {aew[2]} {aew[3]}")
        
        # Assign farmers to first AEW
        aew_id = aews[0][0]
        print(f"\n📌 Assigning all farmers to AEW ID: {aew_id}")
        
        # Count unassigned
        unassigned = db.execute(text("SELECT COUNT(*) FROM farmers WHERE aew_id IS NULL")).scalar()
        print(f"📊 Unassigned farmers: {unassigned}")
        
        # Assign
        db.execute(text(f"UPDATE farmers SET aew_id = {aew_id} WHERE aew_id IS NULL"))
        db.commit()
        
        # Verify
        assigned = db.execute(text(f"SELECT COUNT(*) FROM farmers WHERE aew_id = {aew_id}")).scalar()
        print(f"✅ Now {assigned} farmers assigned to AEW {aews[0][2]} {aews[0][3]}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    assign_aew()