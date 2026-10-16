import importlib
import os
import pkgutil
import sys
from datetime import date, timedelta
from decimal import Decimal

for key, value in {
    "DB_HOST": "x",
    "DB_PORT": "5432",
    "DB_NAME": "x",
    "DB_USER": "x",
    "DB_PASSWORD": "x",
    "DATABASE_URL": "sqlite://",
    "SECRET_KEY": "test-secret",
    "ALGORITHM": "HS256",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "PSA_API_URL": "http://example.test",
    "BANTAY_PRESYO_URL": "http://example.test",
    "ALLOWED_ORIGINS": "http://example.test",
    "BREVO_API_KEY": "test-key",
    "BREVO_SENDER_EMAIL": "test@example.test",
}.items():
    os.environ.setdefault(key, value)

sys.path.insert(0, ".")

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles


@compiles(JSONB, "sqlite")
def _jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.core.auth import get_current_user
from src.core.database import Base, get_db

import src.models

for _, module_name, _ in pkgutil.iter_modules(src.models.__path__):
    importlib.import_module(f"src.models.{module_name}")

from src.api.routes import aew_dashboard
from src.models.farmers import Farmer
from src.models.offtake_requests import OfftakeRequest
from src.models.planting_intents import PlantingIntent
from src.models.users import User

from src.models.raw_plant_reports import RawPlantReport

RawPlantReport.__table__.c.attachments.server_default = None

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
session_factory = sessionmaker(bind=engine)

app = FastAPI()
app.include_router(aew_dashboard.router, prefix="/api/aew/dashboard")
acting = {"id": None}


def override_db():
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


def current_user():
    session = session_factory()
    try:
        user = session.query(User).filter(User.user_id == acting["id"]).first()
        session.expunge(user)
        return user
    finally:
        session.close()


app.dependency_overrides[get_db] = override_db
app.dependency_overrides[get_current_user] = current_user
client = TestClient(app)


def seed():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = session_factory()
    aew, other, mcoord = [
        User(
            first_name="Test",
            last_name=name,
            username=f"u-{name}",
            email_address=f"{name}@example.test",
            phone_number="09170000000",
            password="x",
            role=role,
            is_active=True,
            is_archived=False,
        )
        for name, role in (
            ("Aew", "Agricultural Extension Worker"),
            ("Other", "AEW"),
            ("Mcoord", "Municipal Coordinator"),
        )
    ]
    session.add_all([aew, other, mcoord])
    session.flush()

    def farmer(owner, n):
        row = Farmer(
            aew_id=owner.user_id,
            rsbsa_id=f"rsbsa-{n}",
            first_name="Farmer",
            last_name=str(n),
            municipality="Mexico",
            barangay="B",
            address="B, Mexico",
            sex="Other",
            birthdate=date(1990, 1, 1),
            phone_number="09171111111",
        )
        session.add(row)
        session.flush()
        return row

    today = date.today()
    mine, lonely, theirs = farmer(aew, 1), farmer(aew, 2), farmer(other, 3)

    def intent(f, commodity, status, finalized, planting, harvest, volume):
        session.add(PlantingIntent(
            farmer_id=f.farmer_id,
            commodity=commodity,
            planting_date=planting,
            harvest_date=harvest,
            volume=Decimal(volume),
            status=status,
            finalized_status=finalized,
        ))

    intent(mine, "Red Onion", "DRAFT", "NOT PLANTED", today, today + timedelta(days=90), "100")
    intent(mine, "Tomato", "SUBMITTED", "NOT PLANTED", today - timedelta(days=3), today + timedelta(days=10), "200")
    intent(mine, "Squash", "SUBMITTED", "PLANTED", today - timedelta(days=30), today + timedelta(days=40), "50")
    intent(theirs, "Tomato", "SUBMITTED", "PLANTED", today, today + timedelta(days=5), "999")
    session.add(OfftakeRequest(
        farmer_id=theirs.farmer_id,
        commodity="Tomato",
        quantity=Decimal("1"),
        selling_price=Decimal("1"),
        harvest_date=today + timedelta(days=5),
    ))
    session.commit()
    ids = {"aew": aew.user_id, "mcoord": mcoord.user_id}
    session.close()
    return ids


def test_dashboard_is_scoped_and_pii_free():
    ids = seed()
    acting["id"] = ids["aew"]
    response = client.get("/api/aew/dashboard")
    assert response.status_code == 200
    body = response.json()

    assert body["kpis"]["registered_farmers"] == 2
    assert body["kpis"]["active_planting_intents"] == 2
    assert body["kpis"]["expected_harvest_30d_kg"] == 200
    assert body["kpis"]["open_offtake_requests"] == 0
    assert body["intent_breakdown"] == {
        "draft": 1, "not_planted": 1, "planted": 1, "harvested": 0, "mediating": 0,
    }
    types = {item["type"] for item in body["action_required"]}
    assert {"finalize_draft", "confirm_planting", "match_offtake"} <= types
    assert body["farmers_without_intent"]["count"] == 1
    raw = response.text.lower()
    assert "rsbsa" not in raw and "phone" not in raw


def test_dashboard_rejects_other_roles():
    ids = seed()
    acting["id"] = ids["mcoord"]
    assert client.get("/api/aew/dashboard").status_code == 403
