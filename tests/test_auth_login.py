import importlib
import os
import pkgutil
import sys
from datetime import datetime, timedelta, timezone

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

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import src.models

for _, module_name, _ in pkgutil.iter_modules(src.models.__path__):
    importlib.import_module(f"src.models.{module_name}")

from src.api.routes import auth as auth_routes
from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.audit_logs import AuditLog
from src.models.users import User


@compiles(JSONB, "sqlite")
def _jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
User.__table__.create(engine, checkfirst=True)
AuditLog.__table__.create(engine, checkfirst=True)
session_factory = sessionmaker(bind=engine)

app = FastAPI()
app.include_router(auth_routes.router, prefix="/api/auth")


@app.post("/test-write")
def write_route_for_auth_test(user: User = Depends(get_current_user)):
    return {"user_id": user.user_id}


def override_db():
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_db] = override_db
client = TestClient(app, base_url="https://testserver")


def test_login_errors_are_generic_and_five_failures_lock_account():
    username = "auth-qa-user"
    password = "CorrectPass1!"
    bearer_only = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer client-readable-token"},
    )
    assert bearer_only.status_code == 401

    db = session_factory()
    db.query(User).filter(User.username == username).delete()
    user = User(
        first_name="QA",
        last_name="User",
        username=username,
        email_address="auth-qa-user@example.test",
        phone_number="09171234567",
        password=auth_routes.pwd_context.hash(password),
        role="System Administrator",
        is_active=False,
        is_archived=False,
    )
    db.add(user)
    db.commit()
    user_id = user.user_id
    db.close()

    unknown_user_response = client.post(
        "/api/auth/login",
        json={"username": "unknown-auth-qa-user", "password": password},
    )
    inactive_user_response = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert unknown_user_response.status_code == 401
    assert inactive_user_response.status_code == 401
    assert unknown_user_response.json()["detail"] == "Invalid credentials."
    assert inactive_user_response.json()["detail"] == "Invalid credentials."

    db = session_factory()
    db.query(User).filter(User.user_id == user_id).update({"is_active": True})
    db.commit()
    db.close()

    for _ in range(4):
        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": "wrong-password"},
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid credentials."

    db = session_factory()
    user = db.query(User).filter(User.user_id == user_id).one()
    assert user.failed_login_attempts == 4
    assert user.locked_until is None
    db.close()

    fifth_failure = client.post(
        "/api/auth/login",
        json={"username": username, "password": "wrong-password"},
    )
    assert fifth_failure.status_code == 401
    assert fifth_failure.json()["detail"] == "Invalid credentials."

    locked_attempt = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert locked_attempt.status_code == 401
    assert locked_attempt.json()["detail"] == "Invalid credentials."

    db = session_factory()
    user = db.query(User).filter(User.user_id == user_id).one()
    assert user.failed_login_attempts == 5
    assert user.locked_until is not None
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    assert user.locked_until > now
    user.locked_until = now - timedelta(seconds=1)
    db.commit()
    db.close()

    successful_login = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert successful_login.status_code == 200
    assert "access_token" not in successful_login.json()
    assert successful_login.cookies.get("esaka_access_token")
    set_cookie = successful_login.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "secure" in set_cookie
    assert "samesite=none" in set_cookie

    current_session = client.get("/api/auth/me")
    assert current_session.status_code == 200
    assert current_session.json()["username"] == username
    allowed_write = client.post(
        "/test-write",
        headers={"Origin": "http://example.test"},
    )
    assert allowed_write.status_code == 200
    blocked_write = client.post(
        "/test-write",
        headers={"Origin": "https://attacker.example"},
    )
    assert blocked_write.status_code == 403
    db = session_factory()
    db.query(User).filter(User.user_id == user_id).update({"is_active": False})
    db.commit()
    db.close()
    assert client.get("/api/auth/me").status_code == 401

    db = session_factory()
    user = db.query(User).filter(User.user_id == user_id).one()
    assert user.failed_login_attempts == 0
    assert user.locked_until is None
    db.query(User).filter(User.user_id == user_id).delete()
    db.commit()
    db.close()
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
