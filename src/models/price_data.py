from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DECIMAL,
    TIMESTAMP,
    text
)

from src.core.database import Base


class PriceData(Base):
    __tablename__ = "price_data"

    price_data_id = Column(Integer, primary_key=True, index=True)
    commodity = Column(String(50), nullable=False)
    price_per_kg = Column(DECIMAL(10, 2), nullable=False)
    record_date = Column(Date, nullable=False)
    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )