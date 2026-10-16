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
from src.models.alert_threshold_configs import AlertThresholdConfig

# Default target demand (kg) and oversupply threshold (%) per commodity,
# so the supply-status map has data to render out of the box.
DEFAULT_THRESHOLDS = {
    "White Onion": {"base_demand": 5000, "oversupply_threshold": 120},
    "Red Onion": {"base_demand": 5000, "oversupply_threshold": 120},
    "Tomato": {"base_demand": 5000, "oversupply_threshold": 120},
    "Squash": {"base_demand": 5000, "oversupply_threshold": 120},
}


def seed_alert_thresholds():
    db = SessionLocal()

    try:
        for commodity, values in DEFAULT_THRESHOLDS.items():
            existing = (
                db.query(AlertThresholdConfig)
                .filter(AlertThresholdConfig.commodity == commodity)
                .first()
            )

            if existing:
                print(f"Alert threshold for {commodity} already exists!")
                continue

            config = AlertThresholdConfig(
                commodity=commodity,
                base_demand=values["base_demand"],
                oversupply_threshold=values["oversupply_threshold"],
                is_active=True,
            )

            db.add(config)
            print(f"Alert threshold for {commodity} created!")

        db.commit()

    finally:
        db.close()


if __name__ == "__main__":
    seed_alert_thresholds()
