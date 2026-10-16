from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.models.report_planting_intents import ReportPlantingIntent
from src.api.schemas.report_planting_intents import (
    ReportPlantingIntentCreate,
    ReportPlantingIntentUpdate,
    ReportPlantingIntentResponse,
)

router = APIRouter()


@router.post("/", response_model=ReportPlantingIntentResponse)
def create_report_planting_intent(
    report: ReportPlantingIntentCreate,
    db: Session = Depends(get_db)
):
    db_report = ReportPlantingIntent(**report.model_dump())

    db.add(db_report)
    db.commit()
    db.refresh(db_report)

    return db_report


@router.get("/", response_model=list[ReportPlantingIntentResponse])
def read_report_planting_intents(
    db: Session = Depends(get_db)
):
    return db.query(ReportPlantingIntent).all()


@router.get("/{report_id}", response_model=ReportPlantingIntentResponse)
def read_report_planting_intent(
    report_id: int,
    db: Session = Depends(get_db)
):
    db_report = db.query(ReportPlantingIntent).filter(
        ReportPlantingIntent.report_id == report_id
    ).first()

    if not db_report:
        raise HTTPException(
            status_code=404,
            detail="Report planting intent not found"
        )

    return db_report


@router.put("/{report_id}", response_model=ReportPlantingIntentResponse)
def update_report_planting_intent(
    report_id: int,
    report: ReportPlantingIntentUpdate,
    db: Session = Depends(get_db)
):
    db_report = db.query(ReportPlantingIntent).filter(
        ReportPlantingIntent.report_id == report_id
    ).first()

    if not db_report:
        raise HTTPException(
            status_code=404,
            detail="Report planting intent not found"
        )

    for key, value in report.model_dump(exclude_unset=True).items():
        setattr(db_report, key, value)

    db.commit()
    db.refresh(db_report)

    return db_report


@router.delete("/{report_id}")
def delete_report_planting_intent(
    report_id: int,
    db: Session = Depends(get_db)
):
    db_report = db.query(ReportPlantingIntent).filter(
        ReportPlantingIntent.report_id == report_id
    ).first()

    if not db_report:
        raise HTTPException(
            status_code=404,
            detail="Report planting intent not found"
        )

    db.delete(db_report)
    db.commit()

    return {
        "message": "Report planting intent deleted successfully."
    }