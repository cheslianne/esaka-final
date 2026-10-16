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


class MarketPriceForecast(Base):
    __tablename__ = "market_price_forecasts"

    market_price_forecast_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    commodity = Column(
        String(50),
        nullable=False
    )

    price_type = Column(
        String(20),
        nullable=False
    )

    data_source = Column(
        String(50),
        nullable=False
    )

    etl_cadence = Column(
        String(20),
        nullable=False
    )

    forecast_date = Column(
        Date,
        nullable=False
    )

    forecast_price_low = Column(
        DECIMAL(10, 2),
        nullable=False
    )

    forecast_price_high = Column(
        DECIMAL(10, 2),
        nullable=False
    )

    generated_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )