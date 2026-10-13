import os
import unittest
from datetime import date

for key, value in {
    "DB_HOST": "x",
    "DB_PORT": "5432",
    "DB_NAME": "x",
    "DB_USER": "x",
    "DB_PASSWORD": "x",
    "DATABASE_URL": "x",
    "SECRET_KEY": "x",
    "ALGORITHM": "HS256",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "PSA_API_URL": "x",
    "BANTAY_PRESYO_URL": "x",
    "ALLOWED_ORIGINS": "http://x",
    "BREVO_API_KEY": "x",
    "BREVO_SENDER_EMAIL": "a@b.c",
}.items():
    os.environ.setdefault(key, value)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import src.models.audit_logs
import src.models.farmers
import src.models.offtake_requests
import src.models.planting_intents
import src.models.raw_plant_reports
import src.models.report_planting_intents
import src.models.report_submission
import src.models.report_validation_history
import src.models.users
from src.api.routes import public_stats
from src.core.database import get_db
from src.models.farmers import Farmer
from src.models.report_submission import ReportSubmission


class PublicStatsTests(unittest.TestCase):
    def setUp(self):
        public_stats._cache.update(expires_at=0.0, payload=None)
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Farmer.__table__.create(self.engine)
        ReportSubmission.__table__.create(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)

        app = FastAPI()
        app.include_router(public_stats.router, prefix="/api/public")

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        public_stats._cache.update(expires_at=0.0, payload=None)

    @staticmethod
    def farmer(municipality):
        return Farmer(
            rsbsa_id=f"R-{municipality}-{id(municipality)}",
            first_name="A",
            last_name="B",
            municipality=municipality,
            barangay="Test",
            address="Test address",
            sex="F",
            birthdate=date(1990, 1, 1),
            phone_number="0000000000",
        )

    def test_empty_database_returns_zero_counts_and_no_rate(self):
        response = self.client.get("/api/public/stats")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "farmers_connected": 0,
                "municipalities_active": 0,
                "reports_submitted": 0,
                "reports_verified": 0,
                "verification_rate": None,
            },
        )

    def test_counts_normalized_municipalities_and_report_statuses(self):
        with self.session_factory() as db:
            db.add_all(
                self.farmer(municipality)
                for municipality in (
                    "Baliuag",
                    " baliuag ",
                    "Bocaue",
                    "  ",
                    "Pulilan",
                )
            )
            db.add_all(
                ReportSubmission(report_id=index, status=status)
                for index, status in enumerate(
                    (
                        "DRAFT",
                        "SUBMITTED_MUNICIPAL_PENDING",
                        "SUBMITTED_REGIONAL_APPROVED",
                        "SUBMITTED_REGIONAL_APPROVED",
                    ),
                    start=1,
                )
            )
            db.commit()

        response = self.client.get("/api/public/stats")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "farmers_connected": 5,
                "municipalities_active": 3,
                "reports_submitted": 3,
                "reports_verified": 2,
                "verification_rate": 67,
            },
        )

    def test_response_is_cached_for_the_ttl(self):
        self.assertEqual(
            self.client.get("/api/public/stats").json()["farmers_connected"],
            0,
        )

        with self.session_factory() as db:
            db.add(self.farmer("Plaridel"))
            db.commit()

        self.assertEqual(
            self.client.get("/api/public/stats").json()["farmers_connected"],
            0,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)