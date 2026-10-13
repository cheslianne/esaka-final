from sqlalchemy import Column, Integer, String
from src.core.database import Base


class Buyer(Base):
    __tablename__ = "buyers"

    buyer_id = Column(Integer, primary_key=True, index=True)

    buyer_name = Column(String(150), nullable=False)

    location = Column(String(150), nullable=False)

    phone_number = Column(String(15), nullable=False)

    email_address = Column(String(100), nullable=False)