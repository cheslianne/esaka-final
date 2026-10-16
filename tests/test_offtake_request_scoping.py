import importlib
import os
import pkgutil
import sys
from datetime import date
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
from src.core.database import get_db

import src.models

for _, module_name, _ in pkgutil.iter_modules(src.models.__path__):
    importlib.import_module(f"src.models.{module_name}")

from src.models.buyers import Buyer
from src.models.buyer_registry import BuyerRegistry
from src.models.buyer_status import BuyerStatus
from src.models.farmers import Farmer
from src.models.offtake_requests import OfftakeRequest
from src.models.users import User
from src.api.routes import offtake_requests as offtake_requests_routes


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
session_factory = sessionmaker(bind=engine)

Buyer.__table__.create(engine, checkfirst=True)
BuyerRegistry.__table__.create(engine, checkfirst=True)
BuyerStatus.__table__.create(engine, checkfirst=True)
User.__table__.create(engine, checkfirst=True)
Farmer.__table__.create(engine, checkfirst=True)
OfftakeRequest.__table__.create(engine, checkfirst=True)

app = FastAPI()
app.include_router(offtake_requests_routes.router, prefix="/api/offtake-requests")

acting_user = {"id": None}


def override_db():
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


def current_user():
    session = session_factory()
    try:
        user = session.query(User).filter(User.user_id == acting_user["id"]).first()
        session.expunge(user)
        return user
    finally:
        session.close()


app.dependency_overrides[get_db] = override_db
app.dependency_overrides[get_current_user] = current_user
client = TestClient(app)


def make_farmer(session, aew_id, suffix):
    farmer = Farmer(
        aew_id=aew_id,
        rsbsa_id=f"test-{suffix}",
        first_name="Test",
        last_name=f"Farmer{suffix}",
        municipality="Test Municipality",
        barangay="Test Barangay",
        address="Test Barangay, Test Municipality",
        sex="Other",
        birthdate=date(1990, 1, 1),
        phone_number=f"091700000{suffix}",
    )
    session.add(farmer)
    session.flush()
    return farmer


def make_request(session, farmer_id, commodity):
    request = OfftakeRequest(
        farmer_id=farmer_id,
        commodity=commodity,
        quantity=Decimal("10.00"),
        selling_price=Decimal("25.00"),
        harvest_date=date(2026, 10, 4),
    )
    session.add(request)
    session.flush()
    return request


def seed_records():
    OfftakeRequest.__table__.drop(engine, checkfirst=True)
    Farmer.__table__.drop(engine, checkfirst=True)
    User.__table__.drop(engine, checkfirst=True)
    Buyer.__table__.create(engine, checkfirst=True)
    User.__table__.create(engine, checkfirst=True)
    Farmer.__table__.create(engine, checkfirst=True)
    OfftakeRequest.__table__.create(engine, checkfirst=True)
    session = session_factory()
    users = [
        User(
            first_name="Test",
            last_name=f"AEW{index}",
            username=f"test-aew-{index}",
            email_address=f"test-aew-{index}@example.test",
            phone_number=f"0917000000{index}",
            password="test-password",
            role="AEW",
            is_active=True,
            is_archived=False,
        )
        for index in (1, 2, 3)
    ]
    session.add_all(users)
    session.flush()
    farmers = [
        make_farmer(session, user.user_id, index)
        for index, user in enumerate(users, start=1)
    ]
    requests = [
        make_request(session, farmer.farmer_id, f"Crop{index}")
        for index, farmer in enumerate(farmers[:2], start=1)
    ]
    session.commit()
    records = {
        "users": [user.user_id for user in users],
        "farmers": [farmer.farmer_id for farmer in farmers],
        "requests": [request.offtake_request_id for request in requests],
    }
    session.close()
    return records


def test_list_only_returns_requests_for_current_aew():
    records = seed_records()
    acting_user["id"] = records["users"][0]

    response = client.get("/api/offtake-requests/")

    assert response.status_code == 200
    assert [item["offtake_request_id"] for item in response.json()] == [
        records["requests"][0]
    ]

    other_farmer_response = client.get(
        "/api/offtake-requests/",
        params={"farmer_id": records["farmers"][1]},
    )
    assert other_farmer_response.status_code == 200
    assert other_farmer_response.json() == []

    acting_user["id"] = records["users"][2]
    empty_response = client.get("/api/offtake-requests/")
    assert empty_response.status_code == 200
    assert empty_response.json() == []


def test_aew_can_create_request_for_owned_farmer():
    records = seed_records()
    acting_user["id"] = records["users"][0]

    response = client.post(
        "/api/offtake-requests/",
        json={
            "farmer_id": records["farmers"][0],
            "commodity": "Tomato",
            "quantity": "10.00",
            "selling_price": "25.00",
            "harvest_date": "2026-10-04",
        },
    )

    assert response.status_code == 200
    assert response.json()["farmer_id"] == records["farmers"][0]
    visible_requests = client.get("/api/offtake-requests/").json()
    assert response.json()["offtake_request_id"] in {
        item["offtake_request_id"] for item in visible_requests
    }


def test_verified_registry_buyer_receives_offtake_email(monkeypatch):
    records = seed_records()
    acting_user["id"] = records["users"][0]

    session = session_factory()
    registry = BuyerRegistry(
        organization="Verified Org",
        contact_person="Contact",
        phone_number="09170000000",
        email_address="verified@example.test",
        address="Somewhere",
        document="doc.pdf",
    )
    session.add(registry)
    session.flush()
    session.add(
        BuyerStatus(buyer_registry_id=registry.buyer_registry_id, status="Verified")
    )
    session.commit()
    session.close()

    sent = []

    async def fake_send(**kwargs):
        sent.append(kwargs)
        return "id"

    monkeypatch.setattr(offtake_requests_routes, "send_offtake_request_email", fake_send)

    response = client.post(
        "/api/offtake-requests/",
        json={
            "farmer_id": records["farmers"][0],
            "commodity": "Tomato",
            "quantity": "10.00",
            "selling_price": "25.00",
            "harvest_date": "2026-10-04",
        },
    )

    assert response.status_code == 200
    assert [s["buyer_email"] for s in sent] == ["verified@example.test"]
    assert sent[0]["farmer_name"] == "Test Farmer1"


def test_aew_cannot_create_request_for_another_aews_farmer():
    records = seed_records()
    acting_user["id"] = records["users"][0]

    response = client.post(
        "/api/offtake-requests/",
        json={
            "farmer_id": records["farmers"][1],
            "commodity": "Tomato",
            "quantity": "10.00",
            "selling_price": "25.00",
            "harvest_date": "2026-10-04",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Farmer not found"


def test_aew_cannot_read_update_or_delete_another_aews_request():
    records = seed_records()
    acting_user["id"] = records["users"][0]
    other_request_id = records["requests"][1]

    read_response = client.get(f"/api/offtake-requests/{other_request_id}")
    update_response = client.put(
        f"/api/offtake-requests/{other_request_id}",
        json={"commodity": "Tomato"},
    )
    delete_response = client.delete(f"/api/offtake-requests/{other_request_id}")

    assert read_response.status_code == 404
    assert update_response.status_code == 404
    assert delete_response.status_code == 404


def test_aew_cannot_reassign_request_to_another_aews_farmer():
    records = seed_records()
    acting_user["id"] = records["users"][0]

    response = client.put(
        f"/api/offtake-requests/{records['requests'][0]}",
        json={"farmer_id": records["farmers"][1]},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Farmer not found"
