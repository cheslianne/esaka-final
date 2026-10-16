from pydantic import BaseModel

class ReportPlantingIntentBase(BaseModel):
    planting_intent_id: int


class ReportPlantingIntentCreate(ReportPlantingIntentBase):
    pass


class ReportPlantingIntentUpdate(BaseModel):
    planting_intent_id: int | None = None


class ReportPlantingIntentResponse(ReportPlantingIntentBase):
    report_id: int

    class Config:
        from_attributes = True