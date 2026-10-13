from sqlalchemy import Column, Integer, String, Text, Date, ForeignKey
from sqlalchemy.orm import relationship

from src.core.database import Base


class Farmer(Base):
    __tablename__ = "farmers"

    farmer_id = Column(Integer, primary_key=True, index=True)

    aew_id = Column(Integer, ForeignKey("users.user_id"), nullable=True, index=True)
    rsbsa_id = Column(String(30), unique=True, nullable=False)
    first_name = Column(String(50), nullable=False)
    middle_name = Column(String, nullable=True)
    last_name = Column(String(50), nullable=False)
    municipality = Column(String(100), nullable=False)
    barangay = Column(String(100), nullable=False)
    address = Column(Text, nullable=False)
    sex = Column(String(10), nullable=False)
    birthdate = Column(Date, nullable=False)
    email_address = Column(String(100), nullable=True)
    phone_number = Column(String(15), nullable=False)

    # Relationships
    planting_intents = relationship(
        "PlantingIntent",
        back_populates="farmer"
    )

    offtake_requests = relationship(
        "OfftakeRequest",
        back_populates="farmer"
    )

    aew = relationship("User", back_populates="farmers")