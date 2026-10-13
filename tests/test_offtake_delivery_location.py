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

from src.api.schemas.offtake_requests import (
    OfftakeRequestCreate,
    OfftakeRequestResponse,
)
from src.models.offtake_requests import OfftakeRequest


def test_delivery_location_is_saved_and_returned_by_offtake_schema():
    location = (
        "Region: Central Luzon, Province: Nueva Ecija, "
        "Municipality/City: San Jose City, Barangay: Abar 1st, "
        "Street/Purok/Sitio: Purok 2, Landmark: Near the public market"
    )
    request = OfftakeRequestCreate(
        farmer_id=7,
        commodity="Tomato",
        quantity="100",
        selling_price="25",
        harvest_date="2026-10-12",
        delivery_location=location,
    )
    response = OfftakeRequest(
        **request.model_dump(),
        offtake_request_id=10,
        created_at="2026-10-05T00:00:00",
    )
    response_data = OfftakeRequestResponse.model_validate(response)

    assert request.delivery_location == location
    assert response_data.delivery_location == location
    assert "delivery_location" in OfftakeRequest.__table__.columns
