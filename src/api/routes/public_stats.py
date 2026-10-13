"""Public, read-only platform statistics for the unauthenticated login page."""

import time

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.models.farmers import Farmer
from src.models.report_status import ReportStatus
from src.models.report_submission import ReportSubmission

router = APIRouter()

CACHE_TTL_SECONDS = 60
_cache: dict = {"expires_at": 0.0, "payload": None}


@router.get("/stats")
def get_public_stats(db: Session = Depends(get_db)):
    """Return aggregate headline figures without exposing record-level data."""
    now = time.monotonic()

    if _cache["payload"] is not None and now < _cache["expires_at"]:
        return _cache["payload"]

    farmers_connected = db.query(func.count(Farmer.farmer_id)).scalar() or 0

    municipality_key = func.lower(func.trim(Farmer.municipality))
    municipalities_active = (
        db.query(func.count(distinct(municipality_key)))
        .filter(
            Farmer.municipality.isnot(None),
            func.trim(Farmer.municipality) != "",
        )
        .scalar()
        or 0
    )

    reports_submitted = (
        db.query(func.count(ReportSubmission.submission_id))
        .filter(ReportSubmission.status != ReportStatus.DRAFT.value)
        .scalar()
        or 0
    )

    reports_verified = (
        db.query(func.count(ReportSubmission.submission_id))
        .filter(
            ReportSubmission.status
            == ReportStatus.SUBMITTED_REGIONAL_APPROVED.value
        )
        .scalar()
        or 0
    )

    verification_rate = (
        round(reports_verified * 100 / reports_submitted)
        if reports_submitted
        else None
    )

    payload = {
        "farmers_connected": farmers_connected,
        "municipalities_active": municipalities_active,
        "reports_submitted": reports_submitted,
        "reports_verified": reports_verified,
        "verification_rate": verification_rate,
    }

    _cache["payload"] = payload
    _cache["expires_at"] = now + CACHE_TTL_SECONDS

    return payload