from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional


class BuyerRegistryBase(BaseModel):
    organization: str
    contact_person: str
    phone_number: str
    email_address: EmailStr
    address: str
    message: Optional[str] = None
    document: str


class BuyerRegistryCreate(BuyerRegistryBase):
    pass


class BuyerRegistryUpdate(BaseModel):
    organization: Optional[str] = None
    contact_person: Optional[str] = None
    phone_number: Optional[str] = None
    email_address: Optional[EmailStr] = None
    address: Optional[str] = None
    message: Optional[str] = None
    document: Optional[str] = None


class BuyerRegistryResponse(BuyerRegistryBase):
    buyer_registry_id: int

    model_config = ConfigDict(from_attributes=True)


class BuyerRegistryWithStatusResponse(BuyerRegistryResponse):
    status: str

    model_config = ConfigDict(from_attributes=True)