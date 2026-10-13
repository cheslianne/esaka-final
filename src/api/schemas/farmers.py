from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import date
from typing import Optional


class FarmerBase(BaseModel):
    rsbsa_id: str
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    municipality: str
    barangay: Optional[str] = None
    address: str
    sex: str
    birthdate: date
    email_address: EmailStr | None = None
    phone_number: str


class FarmerCreate(FarmerBase):
    pass


class FarmerUpdate(BaseModel):
    rsbsa_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    municipality: str | None = None
    barangay: str | None = None
    address: str | None = None
    sex: str | None = None
    birthdate: date | None = None
    email_address: str | None = None
    phone_number: str | None = None


class FarmerResponse(FarmerBase):
    farmer_id: int

    model_config = ConfigDict(
        from_attributes=True
    )