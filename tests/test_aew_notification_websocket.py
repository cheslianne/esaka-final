import os
import sys

for key, value in {
    "DB_HOST": "x",
    "DB_PORT": "5432",
    "DB_NAME": "x",
    "DB_USER": "x",
    "DB_PASSWORD": "x",
    "DATABASE_URL": "sqlite://",
    "ALLOWED_ORIGINS": "http://example.test",
}.items():
    os.environ.setdefault(key, value)

sys.path.insert(0, ".")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.routes import planting_intents
from src.core.auth import AUTH_COOKIE_NAME, create_access_token


class FakeUser:
    user_id = 42
    role = "AEW"
    is_active = True
    is_archived = False


class FakeQuery:
    def filter(self, *_args):
        return self

    def first(self):
        return FakeUser()


class FakeSession:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def query(self, *_args):
        return FakeQuery()


app = FastAPI()
app.include_router(planting_intents.router, prefix="/api/planting-intents")
client = TestClient(app, base_url="https://testserver")


def test_aew_websocket_sends_authenticated_map_snapshot(monkeypatch):
    expected_data = {
        "data": [
            {
                "municipality": "Test Municipality",
                "commodities": [
                    {"commodity": "Rice", "status": "DEFICIT"},
                ],
            },
        ],
    }
    monkeypatch.setattr(planting_intents, "SessionLocal", FakeSession)
    monkeypatch.setattr(
        planting_intents,
        "_get_municipality_map_data",
        lambda _db: expected_data,
    )
    client.cookies.set(
        AUTH_COOKIE_NAME,
        create_access_token({"user_id": FakeUser.user_id}),
    )

    with client.websocket_connect(
        "/api/planting-intents/municipality-map/ws",
        headers={"origin": "http://example.test"},
    ) as websocket:
        assert websocket.receive_json() == {
            "type": "municipality-map",
            **expected_data,
        }
