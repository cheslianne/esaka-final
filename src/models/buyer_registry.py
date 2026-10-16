from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import relationship

from src.core.database import Base


class BuyerRegistry(Base):
    __tablename__ = "buyer_registry"

    buyer_registry_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    organization = Column(
        String(150),
        nullable=False
    )

    contact_person = Column(
        String(100),
        nullable=False
    )

    phone_number = Column(
        String(15),
        nullable=False
    )

    email_address = Column(
        String(100),
        nullable=False
    )

    address = Column(
        Text,
        nullable=False
    )

    message = Column(
        Text,
        nullable=True
    )

    document = Column(
        String(255),
        nullable=False
    )

    buyer_status = relationship(
        "BuyerStatus",
        back_populates="buyer_registry",
        uselist=False,
        cascade="all, delete-orphan"
    )