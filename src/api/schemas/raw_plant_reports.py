from pydantic import BaseModel, Field
from datetime import date, datetime
from decimal import Decimal
from typing import Any


class RawPlantReportBase(BaseModel):
    planting_date: date
    estimated_yield: Decimal
    municipal_coordinator_id: int | None = None
    encoded_by: int


class RawPlantReportCreate(RawPlantReportBase):
    title: str | None = None
    commodity: str | None = None
    notes: str | None = None
    municipality: str | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class RawPlantReportUpdate(BaseModel):
    title: str | None = None
    commodity: str | None = None
    notes: str | None = None
    status: str | None = None
    planting_date: date | None = None
    estimated_yield: Decimal | None = None
    municipal_coordinator_id: int | None = None
    encoded_by: int | None = None
    municipality: str | None = None
    attachments: list[dict[str, Any]] | None = None


class RawPlantReportResponse(RawPlantReportBase):
    report_id: int
    title: str | None = None
    commodity: str | None = None
    notes: str | None = None
    status: str | None = None
    municipality: str | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True