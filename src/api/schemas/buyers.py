from pydantic import BaseModel, EmailStr


class BuyerBase(BaseModel):
    buyer_name: str
    location: str
    phone_number: str
    email_address: EmailStr


class BuyerCreate(BuyerBase):
    pass


class BuyerUpdate(BaseModel):
    buyer_name: str | None = None
    location: str | None = None
    phone_number: str | None = None
    email_address: EmailStr | None = None


class BuyerResponse(BuyerBase):
    buyer_id: int

    class Config:
        from_attributes = True