from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.alert_threshold_configs import AlertThresholdConfig
from src.models.alert_threshold_config_history import AlertThresholdConfigHistory
from src.models.planting_intents import PlantingIntent
from src.models.farmers import Farmer
from src.models.users import User

from src.api.schemas.alert_threshold_configs import (
    AlertThresholdConfigCreate,
    AlertThresholdConfigResponse,
)


router = APIRouter(
    tags=["Alert Thresholds"],
)


ALLOWED_COMMODITIES = {
    "White Onion",
    "Red Onion",
    "Tomato",
    "Squash",
}


def _normalize_role(role: str | None) -> str:
    """Lower-case and keep only letters/digits.

    "DA-RFO Officer"       -> "darfoofficer"
    "System Administrator" -> "systemadministrator"
    """
    return "".join(ch for ch in (role or "").lower() if ch.isalnum())


def _is_threshold_editor(role: str | None) -> bool:
    """Roles allowed to change thresholds and read the change history.

    - Any DA-RFO role ("DA-RFO", "DA_RFO", "DA-RFO Officer", ...)
    - Admin / System Administrator
    (Remove "systemadministrator" if admins should NOT edit thresholds.)
    """
    r = _normalize_role(role)
    return r.startswith("darfo") or r in {"admin", "systemadministrator"}


def require_threshold_editor(
    current_user: User = Depends(get_current_user),
) -> User:
    if not _is_threshold_editor(current_user.role):
        raise HTTPException(
            status_code=403,
            detail="Only DA-RFO users can change alert thresholds.",
        )
    return current_user


def _full_name(user: User) -> str:
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or user.username


@router.get(
    "",
    response_model=list[AlertThresholdConfigResponse],
)
def get_alert_thresholds(
    db: Session = Depends(get_db),
):
    return (
        db.query(AlertThresholdConfig)
        .filter(
            AlertThresholdConfig.is_active.is_(True)
        )
        .order_by(AlertThresholdConfig.commodity)
        .all()
    )


# ============================================================
# CONFIGURATION HISTORY (audit trail)
# NOTE: must stay above "/{commodity}", otherwise "history"
# would be read as a commodity name.
# ============================================================


@router.get("/history")
def get_alert_threshold_history(
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
    _editor: User = Depends(require_threshold_editor),
):
    rows = (
        db.query(AlertThresholdConfigHistory)
        .order_by(
            AlertThresholdConfigHistory.changed_at.desc(),
            AlertThresholdConfigHistory.id.desc(),
        )
        .limit(limit)
        .all()
    )

    def num(value):
        return float(value) if value is not None else None

    return [
        {
            "id": row.id,
            "commodity": row.commodity,
            "base_demand": num(row.base_demand),
            "oversupply_threshold": num(row.oversupply_threshold),
            "previous_base_demand": num(row.previous_base_demand),
            "previous_oversupply_threshold": num(row.previous_oversupply_threshold),
            "changed_by": row.changed_by,
            "changed_by_name": row.changed_by_name,
            # stored as naive UTC; send it with an explicit offset so browsers
            # show the correct local time
            "changed_at": row.changed_at.replace(tzinfo=timezone.utc).isoformat(),
        }
        for row in rows
    ]


# ============================================================
# OVERSUPPLY ALERT
# ============================================================


@router.get(
    "/oversupply/{commodity}",
)
def get_oversupply_alert(
    commodity: str,
    municipality: str,
    db: Session = Depends(get_db),
):
    # Get active threshold configuration
    config = (
        db.query(AlertThresholdConfig)
        .filter(
            AlertThresholdConfig.commodity == commodity,
            AlertThresholdConfig.is_active.is_(True),
        )
        .first()
    )

    if not config:
        raise HTTPException(
            status_code=404,
            detail=f"No alert threshold configuration found for {commodity}",
        )

    # Get submitted planting intents for this commodity
    # ONLY within the selected municipality
    projected_supply = (
        db.query(PlantingIntent.volume)
        .join(
            Farmer,
            PlantingIntent.farmer_id == Farmer.farmer_id,
        )
        .filter(
            PlantingIntent.commodity == commodity,
            PlantingIntent.status == "SUBMITTED",
            Farmer.municipality == municipality,
        )
        .all()
    )

    total_supply = sum(
        float(row[0] or 0)
        for row in projected_supply
    )

    # Get base demand and calculate alert limit
    base_demand = float(config.base_demand or 0)
    threshold_percent = float(
        config.oversupply_threshold or 100
    )

    alert_limit = (
        base_demand * threshold_percent / 100
    )

    # Determine status
    if total_supply > alert_limit:
        status = "OVERSUPPLY"
    elif total_supply > base_demand:
        status = "SURPLUS"
    elif total_supply < base_demand:
        status = "DEFICIT"
    else:
        status = "BALANCE"

    # Calculate excess metrics
    excess_supply = max(
        total_supply - base_demand,
        0,
    )

    oversupply_excess = max(
        total_supply - alert_limit,
        0,
    )

    supply_percentage = (
        (total_supply / base_demand) * 100
        if base_demand > 0
        else 0
    )

    return {
        "commodity": config.commodity,
        "municipality": municipality,
        "base_demand": base_demand,
        "threshold_percent": threshold_percent,
        "alert_limit": alert_limit,
        "projected_supply": total_supply,
        "excess_supply": excess_supply,
        "oversupply_excess": oversupply_excess,
        "supply_percentage": supply_percentage,
        "status": status,
    }


@router.get(
    "/{commodity}",
    response_model=AlertThresholdConfigResponse,
)
def get_alert_threshold(
    commodity: str,
    db: Session = Depends(get_db),
):
    config = (
        db.query(AlertThresholdConfig)
        .filter(
            AlertThresholdConfig.commodity == commodity,
            AlertThresholdConfig.is_active.is_(True),
        )
        .first()
    )

    if not config:
        raise HTTPException(
            status_code=404,
            detail=f"No alert threshold configuration found for {commodity}",
        )

    return config


@router.post(
    "",
    response_model=AlertThresholdConfigResponse,
)
def save_alert_threshold(
    payload: AlertThresholdConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_threshold_editor),
):
    if payload.commodity not in ALLOWED_COMMODITIES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid commodity. "
                "Allowed commodities: White Onion, Red Onion, Tomato, Squash"
            ),
        )

    existing = (
        db.query(AlertThresholdConfig)
        .filter(
            AlertThresholdConfig.commodity == payload.commodity
        )
        .first()
    )

    if existing:
        previous_demand = existing.base_demand
        previous_threshold = existing.oversupply_threshold
        was_active = bool(existing.is_active)

        changed = (
            float(previous_demand or 0) != float(payload.base_demand)
            or float(previous_threshold or 0) != float(payload.oversupply_threshold)
            or not was_active
        )

        existing.base_demand = payload.base_demand
        existing.oversupply_threshold = payload.oversupply_threshold
        existing.is_active = True

        # Record the change together with the update (same transaction)
        if changed:
            db.add(
                AlertThresholdConfigHistory(
                    commodity=payload.commodity,
                    base_demand=payload.base_demand,
                    oversupply_threshold=payload.oversupply_threshold,
                    previous_base_demand=previous_demand,
                    previous_oversupply_threshold=previous_threshold,
                    changed_by=current_user.user_id,
                    changed_by_name=_full_name(current_user),
                )
            )

        db.commit()
        db.refresh(existing)

        return existing

    config = AlertThresholdConfig(
        commodity=payload.commodity,
        base_demand=payload.base_demand,
        oversupply_threshold=payload.oversupply_threshold,
        is_active=True,
        created_by=current_user.user_id,
    )

    db.add(config)

    db.add(
        AlertThresholdConfigHistory(
            commodity=payload.commodity,
            base_demand=payload.base_demand,
            oversupply_threshold=payload.oversupply_threshold,
            previous_base_demand=None,
            previous_oversupply_threshold=None,
            changed_by=current_user.user_id,
            changed_by_name=_full_name(current_user),
        )
    )

    db.commit()
    db.refresh(config)

    return config