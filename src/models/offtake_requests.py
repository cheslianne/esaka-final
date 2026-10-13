from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DECIMAL,
    TIMESTAMP,
    Text,
    ForeignKey,
    text
)
from sqlalchemy.orm import relationship

from src.core.database import Base


class OfftakeRequest(Base):
    __tablename__ = "offtake_request"

    offtake_request_id = Column(Integer, primary_key=True, index=True)
    farmer_id = Column(
        Integer,
        ForeignKey("farmers.farmer_id"),
        nullable=False
    )
    commodity = Column(String(50), nullable=False)
    quantity = Column(DECIMAL(10, 2), nullable=False)
    selling_price = Column(DECIMAL(10, 2), nullable=False)
    harvest_date = Column(Date, nullable=False)
    delivery_location = Column(Text, nullable=True)
    commodity_photo = Column(String(255), nullable=True)
    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )

    farmer = relationship(
        "Farmer",
        back_populates="offtake_requests"
    )