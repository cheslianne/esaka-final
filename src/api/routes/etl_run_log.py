from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from fastapi import BackgroundTasks
from src.etl_pipeline.scheduler import run_pipeline

from src.core.database import get_db
from src.models.etl_run_log import ETLRunLog

from src.api.schemas.etl_run_logs import (
    ETLRunLogCreate,
    ETLRunLogResponse,
)


router = APIRouter()


@router.post(
    "/",
    response_model=ETLRunLogResponse
)
def create_etl_run_log(
    log: ETLRunLogCreate,
    db: Session = Depends(get_db)
):

    db_log = ETLRunLog(
        data_source=log.data_source,
        status=log.status,
        error_message=log.error_message,
    )

    db.add(db_log)
    db.commit()
    db.refresh(db_log)

    return db_log


@router.get(
    "/",
    response_model=list[ETLRunLogResponse]
)
def read_etl_run_log(
    db: Session = Depends(get_db)
):

    logs = (
        db.query(ETLRunLog)
        .order_by(
            ETLRunLog.run_date_time.desc()
        )
        .all()
    )

    return logs

@router.post("/manual-run")
def manual_run_etl(
    background_tasks: BackgroundTasks
):
    background_tasks.add_task(run_pipeline)

    return {
        "message": "ETL pipeline manual run started."
    }