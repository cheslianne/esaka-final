from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class BuyerStatusBase(BaseModel):
    buyer_registry_id: int
    status: str


class BuyerStatusCreate(BuyerStatusBase):
    pass


class BuyerStatusUpdate(BaseModel):
    buyer_registry_id: Optional[int] = None
    status: Optional[str] = None


class BuyerStatusResponse(BuyerStatusBase):
    buyer_status_id: int
    reviewed_at: datetime

    class Config:
        from_attributes = True