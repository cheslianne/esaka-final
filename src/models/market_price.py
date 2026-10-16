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


class MarketPrice(Base):
    __tablename__ = "market_prices"

    market_price_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    commodity = Column(
        String(50),
        nullable=False
    )

    wholesale_price_per_kg = Column(
        DECIMAL(10, 2),
        nullable=False
    )

    retail_price_per_kg = Column(
        DECIMAL(10, 2),
        nullable=False
    )

    record_date = Column(
        Date,
        nullable=False
    )

    data_source = Column(
        String(30),
        nullable=False,
        default="SEED_DATA"
    )

    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )