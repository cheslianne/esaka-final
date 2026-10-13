import importlib
import os
import pkgutil

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

for key, value in {
    "DB_HOST": "x", "DB_PORT": "5432", "DB_NAME": "x", "DB_USER": "x",
    "DB_PASSWORD": "x", "DATABASE_URL": "sqlite://", "SECRET_KEY": "test",
    "ALGORITHM": "HS256", "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
}.items():
    os.environ.setdefault(key, value)


@compiles(JSONB, "sqlite")
def _jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


from src.core.auth import get_current_user
from src.core.database import Base, get_db
from src.models.users import User
from src.api.routes import da_rfo_dashboard

for _, module_name, _ in pkgutil.iter_modules(__import__("src.models", fromlist=["__path__"]).__path__):
    importlib.import_module(f"src.models.{module_name}")

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
session_factory = sessionmaker(bind=engine)
app = FastAPI()
app.include_router(da_rfo_dashboard.router, prefix="/api/da-rfo/dashboard")
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


def seed_user(role):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = session_factory()
    user = User(
        first_name="Dashboard",
        last_name="Tester",
        username="dashboard-tester",
        email_address="dashboard@example.test",
        phone_number="09170000000",
        hashed_password="not-a-real-password",
        role=role,
        is_active=True,
        is_archived=False,
    )
    session.add(user)
    session.commit()
    acting["id"] = user.user_id
    session.close()


def test_da_rfo_dashboard_is_aggregate_only():
    seed_user("DA-RFO Officer")
    response = client.get("/api/da-rfo/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == "DA-RFO"
    assert {"kpis", "actions", "supply_risk", "alerts", "prices", "etl", "report_pipeline", "summary"} <= body.keys()
    assert "phone_number" not in response.text
    assert "email_address" not in response.text
    assert "farmer_id" not in response.text


def test_da_rfo_dashboard_rejects_non_regional_role():
    seed_user("Agricultural Extension Worker")
    assert client.get("/api/da-rfo/dashboard").status_code == 403
