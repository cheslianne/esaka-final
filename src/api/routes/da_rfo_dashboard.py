"""Regional, PII-free aggregates for the DA-RFO landing dashboard."""

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.etl_run_log import ETLRunLog
from src.models.farmers import Farmer
from src.models.market_price import MarketPrice
from src.models.market_price_forecast import MarketPriceForecast
from src.models.offtake_requests import OfftakeRequest
from src.models.planting_intents import PlantingIntent
from src.models.raw_plant_reports import RawPlantReport
from src.models.report_status import ReportStatus
from src.models.report_submission import ReportSubmission
from src.models.users import User

router = APIRouter()
DA_RFO_ROLES = {"DA-RFO Officer", "Regional Coordinator", "DA-RFO"}
COMMODITIES = ("Red Onion", "White Onion", "Tomato", "Squash")


def _commodity(value: str | None) -> str | None:
    text = (value or "").strip().lower()
    for name in COMMODITIES:
        if name.lower() in text:
            return name
    if "kalabasa" in text:
        return "Squash"
    return None


def _number(value) -> float:
    return round(float(value or 0), 2)


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _latest_success(db: Session, sources: list[str] | None = None) -> str | None:
    query = db.query(func.max(ETLRunLog.run_date_time)).filter(
        ETLRunLog.status == "SUCCESS"
    )
    if sources:
        query = query.filter(ETLRunLog.data_source.in_(sources))
    return _iso(query.scalar())


@router.get("")
def get_da_rfo_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return regional aggregates only; no person, buyer, or report identifiers."""
    if current_user.role not in DA_RFO_ROLES:
        raise HTTPException(status_code=403, detail="Access denied.")

    today = date.today()
    horizon = today + timedelta(days=30)
    farmers = db.query(Farmer).all()
    farmer_ids = [farmer.farmer_id for farmer in farmers]
    intents = (
        db.query(PlantingIntent).filter(PlantingIntent.farmer_id.in_(farmer_ids)).all()
        if farmer_ids else []
    )
    offtakes = (
        db.query(OfftakeRequest).filter(OfftakeRequest.farmer_id.in_(farmer_ids)).all()
        if farmer_ids else []
    )
    active_intents = [
        row for row in intents
        if (row.status or "DRAFT").upper() != "DRAFT"
        and (row.finalized_status or "").upper() in {"NOT PLANTED", "PLANTED", "MEDIATING"}
    ]
    open_offtakes = [row for row in offtakes if row.harvest_date >= today]

    submissions = db.query(ReportSubmission).all()
    report_counts = defaultdict(int)
    for row in submissions:
        status = (row.status or "DRAFT").upper()
        if status == ReportStatus.SUBMITTED_MUNICIPAL_PENDING.value:
            report_counts["municipal_pending"] += 1
        elif status == ReportStatus.SUBMITTED_PROVINCIAL_PENDING.value:
            report_counts["provincial_pending"] += 1
        elif status == ReportStatus.SUBMITTED_REGIONAL_PENDING.value:
            report_counts["regional_pending"] += 1
        elif status in {
            ReportStatus.SUBMITTED_MUNICIPAL_FLAGGED.value,
            ReportStatus.SUBMITTED_PROVINCIAL_FLAGGED.value,
            ReportStatus.SUBMITTED_REGIONAL_FLAGGED.value,
        }:
            report_counts["flagged"] += 1
        elif status == ReportStatus.SUBMITTED_REGIONAL_APPROVED.value:
            report_counts["approved"] += 1
        elif status == ReportStatus.DRAFT.value:
            report_counts["draft"] += 1

    supply = defaultdict(float)
    demand = defaultdict(float)
    for row in active_intents:
        key = ((row.farmer.municipality if row.farmer else "Unknown"), _commodity(row.commodity))
        if key[1]:
            supply[key] += _number(row.volume)
    for row in open_offtakes:
        key = ((row.farmer.municipality if row.farmer else "Unknown"), _commodity(row.commodity))
        if key[1]:
            demand[key] += _number(row.quantity)

    supply_risk = []
    alerts = []
    for (municipality, commodity), volume in sorted(supply.items()):
        expected_demand = demand[(municipality, commodity)]
        if expected_demand == 0:
            status = "NO_DEMAND"
        elif volume > expected_demand * 1.2:
            status = "SURPLUS"
        elif volume < expected_demand * 0.8:
            status = "DEFICIT"
        else:
            status = "BALANCED"
        supply_risk.append({
            "municipality": municipality,
            "commodity": commodity,
            "supply_30d_kg": volume,
            "demand_30d_kg": expected_demand,
            "status": status,
        })
        if status in {"SURPLUS", "DEFICIT"}:
            alerts.append({
                "type": "supply_risk",
                "severity": "high" if status == "DEFICIT" else "medium",
                "municipality": municipality,
                "commodity": commodity,
                "message": f"{status.title()} risk for {commodity}.",
            })

    intent_status = defaultdict(int)
    harvest_timeline = defaultdict(lambda: defaultdict(float))
    planting_intents_by_municipality = defaultdict(lambda: defaultdict(int))
    for row in active_intents:
        status = (row.finalized_status or "NOT PLANTED").upper()
        intent_status[status] += 1
        municipality = row.farmer.municipality if row.farmer else "Unknown"
        planting_intents_by_municipality[municipality][status] += 1
        if today <= row.harvest_date <= horizon:
            week_start = row.harvest_date - timedelta(days=row.harvest_date.weekday())
            harvest_timeline[week_start.isoformat()][_commodity(row.commodity) or "Other"] += _number(row.volume)

    prices = []
    for commodity in COMMODITIES:
        rows = sorted(
            (row for row in db.query(MarketPrice).all() if _commodity(row.commodity) == commodity),
            key=lambda row: row.record_date,
        )
        latest = rows[-1] if rows else None
        previous = rows[-2] if len(rows) > 1 else None
        delta = (
            _number(latest.wholesale_price_per_kg) - _number(previous.wholesale_price_per_kg)
            if latest and previous else 0
        )
        forecast = (
            db.query(MarketPriceForecast)
            .filter(MarketPriceForecast.commodity == commodity, MarketPriceForecast.forecast_date >= today)
            .order_by(MarketPriceForecast.forecast_date.asc())
            .first()
        )
        prices.append({
            "commodity": commodity,
            "wholesale_price_per_kg": _number(latest.wholesale_price_per_kg) if latest else None,
            "retail_price_per_kg": _number(latest.retail_price_per_kg) if latest else None,
            "record_date": _iso(latest.record_date) if latest else None,
            "trend": "up" if delta > 0 else "down" if delta < 0 else "steady",
            "forecast_low": _number(forecast.forecast_price_low) if forecast else None,
            "forecast_high": _number(forecast.forecast_price_high) if forecast else None,
            "forecast_date": _iso(forecast.forecast_date) if forecast else None,
        })

    etl = []
    recent_etl = db.query(ETLRunLog).order_by(ETLRunLog.run_date_time.desc()).limit(10).all()
    for row in recent_etl[:5]:
        etl.append({
            "data_source": row.data_source,
            "status": row.status,
            "run_date_time": _iso(row.run_date_time),
        })
    etl_successes = sum(1 for row in recent_etl if (row.status or "").upper() == "SUCCESS")

    flagged = report_counts["flagged"]
    if flagged:
        alerts.append({
            "type": "report_pipeline",
            "severity": "medium",
            "message": f"{flagged} report(s) require revision.",
        })

    return {
        "scope": "DA-RFO",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "freshness": {
            "last_refresh": _latest_success(db),
            "psa_openstat": _latest_success(db, ["PSA OpenSTAT"]),
        },
        "kpis": {
            "registered_farmers": len(farmers),
            "municipalities": len({farmer.municipality for farmer in farmers if farmer.municipality}),
            "active_planting_intents": len(active_intents),
            "expected_harvest_30d_kg": _number(sum(
                row.volume for row in active_intents
                if today <= row.harvest_date <= horizon
            )),
            "open_offtake_requests": len(open_offtakes),
            "reports_pending": report_counts["municipal_pending"] + report_counts["provincial_pending"] + report_counts["regional_pending"],
            "reports_approved": report_counts["approved"],
            "alerts": len(alerts),
            "etl_reliability_pct": round(etl_successes / len(recent_etl) * 100, 1) if recent_etl else None,
        },
        "actions": [
            {"type": "regional_validation", "label": "Reports awaiting regional validation", "count": report_counts["regional_pending"]},
            {"type": "revision_queue", "label": "Reports flagged for revision", "count": flagged},
            {"type": "supply_risk", "label": "Municipality-commodity risks", "count": sum(1 for item in supply_risk if item["status"] in {"SURPLUS", "DEFICIT"})},
        ],
        "supply_risk": supply_risk,
        "alerts": alerts,
        "prices": prices,
        "etl": etl,
        "etl_reliability": {
            "successes": etl_successes,
            "runs": len(recent_etl),
            "success_rate_pct": round(etl_successes / len(recent_etl) * 100, 1) if recent_etl else None,
        },
        "intent_status": [
            {"status": status, "count": count}
            for status, count in sorted(intent_status.items())
        ],
        "harvest_timeline": [
            {
                "week": week,
                "commodities": {
                    commodity: _number(volume)
                    for commodity, volume in sorted(commodities.items())
                },
            }
            for week, commodities in sorted(harvest_timeline.items())
        ],
        "planting_intents_by_municipality": [
            {
                "municipality": municipality,
                "statuses": dict(sorted(statuses.items())),
                "total": sum(statuses.values()),
            }
            for municipality, statuses in sorted(
                planting_intents_by_municipality.items(),
                key=lambda item: (-sum(item[1].values()), item[0]),
            )
        ],
        "report_pipeline": dict(report_counts),
        "summary": {
            "active_municipalities": len({item["municipality"] for item in supply_risk}),
            "commodities_tracked": len({item["commodity"] for item in supply_risk}),
            "window_days": 30,
        },
    }
