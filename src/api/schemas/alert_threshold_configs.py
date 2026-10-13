from decimal import Decimal

from pydantic import BaseModel, Field, ConfigDict


class AlertThresholdConfigCreate(BaseModel):
    commodity: str
    base_demand: Decimal = Field(gt=0)
    oversupply_threshold: Decimal = Field(
        ge=100,
        le=150
    )


class AlertThresholdConfigResponse(BaseModel):
    id: int
    commodity: str
    base_demand: Decimal
    oversupply_threshold: Decimal
    is_active: bool

    model_config = ConfigDict(from_attributes=True)