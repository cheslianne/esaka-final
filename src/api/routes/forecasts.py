from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.models.forecasts import Forecast
from src.api.schemas.forecasts import (
    ForecastCreate,
    ForecastUpdate,
    ForecastResponse,
)

router = APIRouter()


@router.post("/", response_model=ForecastResponse)
def create_forecast(
    forecast: ForecastCreate,
    db: Session = Depends(get_db)
):
    db_forecast = Forecast(**forecast.model_dump())

    db.add(db_forecast)
    db.commit()
    db.refresh(db_forecast)

    return db_forecast


@router.get("/", response_model=list[ForecastResponse])
def read_forecasts(
    db: Session = Depends(get_db)
):
    forecasts = (
        db.query(Forecast)
        .order_by(Forecast.forecast_id.asc())
        .all()
    )

    return forecasts


@router.get("/{forecast_id}", response_model=ForecastResponse)
def read_forecast(
    forecast_id: int,
    db: Session = Depends(get_db)
):
    db_forecast = (
        db.query(Forecast)
        .filter(Forecast.forecast_id == forecast_id)
        .first()
    )

    if not db_forecast:
        raise HTTPException(
            status_code=404,
            detail="Forecast not found"
        )

    return db_forecast


@router.put("/{forecast_id}", response_model=ForecastResponse)
def update_forecast(
    forecast_id: int,
    forecast: ForecastUpdate,
    db: Session = Depends(get_db)
):
    db_forecast = (
        db.query(Forecast)
        .filter(Forecast.forecast_id == forecast_id)
        .first()
    )

    if not db_forecast:
        raise HTTPException(
            status_code=404,
            detail="Forecast not found"
        )

    for key, value in forecast.model_dump(exclude_unset=True).items():
        setattr(db_forecast, key, value)

    db.commit()
    db.refresh(db_forecast)

    return db_forecast


@router.delete("/{forecast_id}")
def delete_forecast(
    forecast_id: int,
    db: Session = Depends(get_db)
):
    db_forecast = (
        db.query(Forecast)
        .filter(Forecast.forecast_id == forecast_id)
        .first()
    )

    if not db_forecast:
        raise HTTPException(
            status_code=404,
            detail="Forecast not found"
        )

    db.delete(db_forecast)
    db.commit()

    return {
        "message": "Forecast deleted successfully."
    }