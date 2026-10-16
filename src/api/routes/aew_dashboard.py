from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.routes.planting_intents import _get_municipality_map_data
from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.audit_logs import AuditLog
from src.models.etl_run_log import ETLRunLog
from src.models.farmers import Farmer
from src.models.price_data import PriceData
from src.models.forecasts import Forecast
from src.models.offtake_requests import OfftakeRequest
from src.models.planting_intents import PlantingIntent
from src.models.raw_plant_reports import RawPlantReport
from src.models.report_submission import ReportSubmission
from src.models.users import User

router = APIRouter()

AEW_ROLES = {"Agricultural Extension Worker", "AEW"}
COMMODITIES = ("Red Onion", "White Onion", "Tomato", "Squash")
HARVEST_SOON_DAYS = 14
OUTLOOK_MONTHS = 6


def _commodity_key(name: str | None) -> str | None:
    value = (name or "").strip().lower()
    if "red onion" in value:
        return "Red Onion"
    if "white onion" in value:
        return "White Onion"
    if "tomato" in value:
        return "Tomato"
    if "squash" in value or "kalabasa" in value:
        return "Squash"
    return None


def _num(value) -> float:
    return float(value or 0)


def _is_draft(intent: PlantingIntent) -> bool:
    return (intent.status or "DRAFT").upper() == "DRAFT"


def _stage(intent: PlantingIntent) -> str:
    if _is_draft(intent):
        return "DRAFT"
    return (intent.finalized_status or "NOT PLANTED").upper().strip()


def _month_starts(today: date, count: int) -> list[date]:
    months = []
    year, month = today.year, today.month
    for _ in range(count):
        months.append(date(year, month, 1))
        month += 1
        if month > 12:
            month, year = 1, year + 1
    return months


def _latest_success(db: Session, sources: list[str]) -> str | None:
    row = (
        db.query(func.max(ETLRunLog.run_date_time))
        .filter(ETLRunLog.data_source.in_(sources), ETLRunLog.status == "SUCCESS")
        .scalar()
    )
    return row.isoformat() if row else None


def _price_snapshot(db: Session, today: date, offtakes: list) -> list[dict]:
    prices = defaultdict(list)
    for row in db.query(PriceData).order_by(PriceData.record_date.asc()).all():
        key = _commodity_key(row.commodity)
        if key:
            prices[key].append(row)

    forecasts = defaultdict(list)
    for row in (
        db.query(Forecast)
        .order_by(Forecast.forecast_date.asc())
        .all()
    ):
        key = _commodity_key(row.commodity)
        if key:
            forecasts[key].append(row)

    below_fair = defaultdict(int)
    next_month = _month_starts(today, 2)[1]

    snapshot = []
    for commodity in COMMODITIES:
        history = prices.get(commodity, [])
        monthly_prices = defaultdict(list)
        for row in history:
            monthly_prices[(row.record_date.year, row.record_date.month)].append(
                _num(row.price_per_kg)
            )
        ordered_months = sorted(monthly_prices)
        latest_month = ordered_months[-1] if ordered_months else None
        previous_month = ordered_months[-2] if len(ordered_months) > 1 else None
        latest_average = (
            sum(monthly_prices[latest_month]) / len(monthly_prices[latest_month])
            if latest_month else None
        )
        previous_average = (
            sum(monthly_prices[previous_month]) / len(monthly_prices[previous_month])
            if previous_month else None
        )

        upcoming = [
            row for row in forecasts.get(commodity, [])
            if row.forecast_date >= next_month
        ]
        if upcoming:
            first = upcoming[0].forecast_date
            same_month = [
                row for row in upcoming
                if (row.forecast_date.year, row.forecast_date.month) == (first.year, first.month)
            ]
            low = min(_num(row.forecast_price_low) for row in same_month)
            high = max(_num(row.forecast_price_high) for row in same_month)
            forecast_month = first.strftime("%B %Y")
        else:
            low = high = forecast_month = None

        trend = "no data"
        if latest_average is not None and previous_average is not None:
            diff = latest_average - previous_average
            trend = "up" if diff > 0 else "down" if diff < 0 else "steady"

        if low is not None:
            for request in offtakes:
                if (
                    _commodity_key(request.commodity) == commodity
                    and _num(request.selling_price) < low
                ):
                    below_fair[commodity] += 1

        snapshot.append({
            "commodity": commodity,
            "last_price": latest_average,
            "last_price_date": (
                f"{latest_month[0]:04d}-{latest_month[1]:02d}"
                if latest_month else None
            ),
            "last_price_label": "Latest monthly average",
            "forecast_label": "Next-month forecast range",
            "trend": trend,
            "forecast_low": low,
            "forecast_high": high,
            "forecast_month": forecast_month,
            "offtake_below_fair": below_fair[commodity],
        })
    return snapshot


@router.get("")
def get_aew_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated, PII-free overview for the signed-in AEW."""
    if current_user.role not in AEW_ROLES:
        raise HTTPException(status_code=403, detail="Access denied.")

    today = date.today()
    aew_id = current_user.user_id

    farmers = db.query(Farmer).filter(Farmer.aew_id == aew_id).all()
    farmer_by_id = {farmer.farmer_id: farmer for farmer in farmers}
    farmer_ids = list(farmer_by_id)

    intents = []
    offtakes = []
    if farmer_ids:
        intents = (
            db.query(PlantingIntent)
            .filter(PlantingIntent.farmer_id.in_(farmer_ids))
            .all()
        )
        offtakes = (
            db.query(OfftakeRequest)
            .filter(OfftakeRequest.farmer_id.in_(farmer_ids))
            .all()
        )

    # ---- Planting intent status breakdown ----
    breakdown = {"draft": 0, "not_planted": 0, "planted": 0, "harvested": 0, "mediating": 0}
    stage_to_key = {
        "DRAFT": "draft",
        "NOT PLANTED": "not_planted",
        "PLANTED": "planted",
        "HARVESTED": "harvested",
        "MEDIATING": "mediating",
    }
    for intent in intents:
        key = stage_to_key.get(_stage(intent))
        if key:
            breakdown[key] += 1

    active_intents = [
        intent for intent in intents
        if _stage(intent) in ("NOT PLANTED", "PLANTED", "MEDIATING")
    ]

    # ---- Expected harvest (next 30 days) and supply outlook ----
    horizon = today + timedelta(days=30)
    expected_30 = sum(
        _num(intent.volume)
        for intent in active_intents
        if today <= intent.harvest_date <= horizon
    )

    months = _month_starts(today, OUTLOOK_MONTHS)
    outlook = {
        month.strftime("%Y-%m"): {commodity: 0.0 for commodity in COMMODITIES}
        for month in months
    }
    for intent in active_intents:
        commodity = _commodity_key(intent.commodity)
        month_key = intent.harvest_date.strftime("%Y-%m")
        if commodity and month_key in outlook:
            outlook[month_key][commodity] += _num(intent.volume)
    supply_outlook = [
        {
            "month": month.strftime("%Y-%m"),
            "label": month.strftime("%b %Y"),
            "volumes": outlook[month.strftime("%Y-%m")],
        }
        for month in months
    ]

    # ---- Offtake requests ----
    # OfftakeRequest has no status or completion field. Until one exists,
    # every request returned by the owned-request query is still open and
    # must match the requests shown on the Offtake Requests page.
    open_offtakes = offtakes
    offtake_pairs = {
        (request.farmer_id, _commodity_key(request.commodity) or (request.commodity or "").lower())
        for request in open_offtakes
    }

    # ---- Reports ----
    reports = (
        db.query(RawPlantReport, ReportSubmission)
        .outerjoin(ReportSubmission, ReportSubmission.report_id == RawPlantReport.report_id)
        .filter(RawPlantReport.encoded_by == aew_id)
        .all()
    )
    pipeline = {"draft": 0, "municipal_pending": 0, "provincial": 0, "approved": 0}
    flagged = []
    for report, submission in reports:
        status = (submission.status if submission else report.status) or "DRAFT"
        if status == "DRAFT":
            pipeline["draft"] += 1
        elif status == "SUBMITTED_MUNICIPAL_PENDING":
            pipeline["municipal_pending"] += 1
        elif status in ("SUBMITTED_PROVINCIAL_PENDING", "SUBMITTED_REGIONAL_PENDING"):
            pipeline["provincial"] += 1
        elif status == "SUBMITTED_REGIONAL_APPROVED":
            pipeline["approved"] += 1
        if status.endswith("_FLAGGED"):
            flagged.append((report, submission))

    # ---- Action required ----
    actions = []
    for report, submission in flagged:
        actions.append({
            "type": "revise_report",
            "priority": 1,
            "title": report.title or f"Report #{report.report_id}",
            "detail": (submission.revision_remarks if submission else None)
            or "Please review the reviewer's comments.",
            "view": "reports",
        })

    for intent in intents:
        farmer = farmer_by_id.get(intent.farmer_id)
        municipality = farmer.municipality if farmer else "assigned municipality"
        label = f"Farmer #{intent.farmer_id} · {intent.commodity} · {municipality}"
        stage = _stage(intent)
        if stage == "DRAFT":
            actions.append({
                "type": "finalize_draft",
                "priority": 3,
                "title": label,
                "detail": "Draft intent not yet finalized.",
                "view": "planting-intent",
            })
            continue
        if stage == "NOT PLANTED" and intent.planting_date < today:
            days = (today - intent.planting_date).days
            actions.append({
                "type": "confirm_planting",
                "priority": 2,
                "title": label,
                "detail": f"Planting date passed {days} day(s) ago but still marked Not Planted.",
                "view": "planting-intent",
            })
        if (
            stage in ("NOT PLANTED", "PLANTED")
            and today <= intent.harvest_date <= today + timedelta(days=HARVEST_SOON_DAYS)
            and (intent.farmer_id, _commodity_key(intent.commodity) or (intent.commodity or "").lower())
            not in offtake_pairs
        ):
            days = (intent.harvest_date - today).days
            actions.append({
                "type": "match_offtake",
                "priority": 2,
                "title": label,
                "detail": f"Harvest in {days} day(s) with no offtake request yet.",
                "view": "offtake-request",
            })
    actions.sort(key=lambda item: item["priority"])

    # ---- Alerts (oversupply advisory) ----
    municipalities = {
        (farmer.municipality or "").strip().lower() for farmer in farmers
    }
    if current_user.municipality:
        municipalities.add(current_user.municipality.strip().lower())
    map_data = _get_municipality_map_data(db)["data"]
    alerts = []
    alert_keys = set()
    for entry in map_data:
        if entry["municipality"].strip().lower() not in municipalities:
            continue
        for item in entry["commodities"]:
            status = str(item.get("status") or "").upper()
            if status not in {"OVERSUPPLY", "SURPLUS", "DEFICIT"}:
                continue
            commodity = str(item.get("commodity") or "").strip()
            municipality = entry["municipality"].strip()
            alert_type = "DEFICIT" if status == "DEFICIT" else "OVERSUPPLY"
            alert_key = (municipality.lower(), commodity.lower(), alert_type)
            if not commodity or alert_key in alert_keys:
                continue
            alert_keys.add(alert_key)
            status_label = "below expected demand" if alert_type == "DEFICIT" else "above expected demand"
            alerts.append({
                "municipality": municipality,
                "commodity": commodity,
                "status": alert_type,
                "message": (
                    f"Advisory: expected {commodity} supply in "
                    f"{municipality} is {status_label}."
                ),
            })

    # ---- Farmers without any planting intent (identifiers only) ----
    with_intent = {intent.farmer_id for intent in intents}
    without_intent = [
        farmer.farmer_id for farmer in farmers if farmer.farmer_id not in with_intent
    ]

    # ---- Recent activity (own actions only) ----
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == aew_id)
        .order_by(AuditLog.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "aew_name": f"{current_user.first_name} {current_user.last_name}".strip(),
        "municipality": current_user.municipality,
        "today": today.isoformat(),
        "freshness": {
            "psa_openstat": _latest_success(db, ["PSA OpenSTAT"]),
            "bantay_presyo": _latest_success(db, ["Market Price ETL", "Market Price Upload — ETL"]),
        },
        "kpis": {
            "registered_farmers": len(farmers),
            "active_planting_intents": len(active_intents),
            "expected_harvest_30d_kg": expected_30,
            "open_offtake_requests": len(open_offtakes),
            "reports_needing_revision": len(flagged),
            "active_alerts": len(alerts),
        },
        "action_required": actions,
        "intent_breakdown": breakdown,
        "supply_outlook": supply_outlook,
        "fair_prices": _price_snapshot(db, today, open_offtakes),
        "report_pipeline": pipeline,
        "alerts": alerts,
        "map": map_data,
        "recent_activity": [
            {
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "created_at": log.created_at.isoformat() if isinstance(log.created_at, datetime) else None,
            }
            for log in logs
        ],
        "farmers_without_intent": {
            "count": len(without_intent),
            "names": without_intent[:5],
        },
    }
