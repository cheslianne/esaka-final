from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.models.alert_threshold_configs import AlertThresholdConfig
from src.models.planting_intents import PlantingIntent
from src.models.farmers import Farmer

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

def get_oversupply_alert(
    commodity: str,
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

    # Sum ALL SUBMITTED planting intents for this commodity (provincial level)
    projected_supply = (
        db.query(PlantingIntent.volume)
        .filter(
            PlantingIntent.commodity == commodity,
            PlantingIntent.status == "SUBMITTED",
        )
        .all()
    )

    total_supply = sum(
        float(row[0] or 0)
        for row in projected_supply
    )

    # Get base demand and calculate alert limit
    base_demand = float(config.base_demand or 0)
    threshold_percent = float(config.oversupply_threshold or 100)
    alert_limit = base_demand * threshold_percent / 100

    # Determine status - consistent with municipality map
    if total_supply > alert_limit:
        status = "OVERSUPPLY"
    elif total_supply > base_demand:
        status = "SURPLUS"
    elif total_supply < base_demand:
        status = "DEFICIT"
    else:
        status = "BALANCE"

    # Calculate excess metrics
    excess_supply = max(total_supply - base_demand, 0)  # Excess above base demand
    oversupply_excess = max(total_supply - alert_limit, 0)  # Excess above alert threshold

    supply_percentage = (
        (total_supply / base_demand) * 100
        if base_demand > 0
        else 0
    )

    return {
        "commodity": config.commodity,
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
        existing.base_demand = payload.base_demand
        existing.oversupply_threshold = payload.oversupply_threshold
        existing.is_active = True

        db.commit()
        db.refresh(existing)

        return existing

    config = AlertThresholdConfig(
        commodity=payload.commodity,
        base_demand=payload.base_demand,
        oversupply_threshold=payload.oversupply_threshold,
        is_active=True,
    )

    db.add(config)
    db.commit()
    db.refresh(config)

    return config