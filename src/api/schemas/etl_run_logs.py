from pydantic import BaseModel
from datetime import datetime


class ETLRunLogBase(BaseModel):
    data_source: str
    status: str
    error_message: str | None = None


class ETLRunLogCreate(ETLRunLogBase):
    pass


class ETLRunLogResponse(ETLRunLogBase):
    etl_log_id: int
    run_date_time: datetime

    class Config:
        from_attributes = True