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


class Forecast(Base):
    __tablename__ = "forecasts"

    forecast_id = Column(Integer, primary_key=True, index=True)
    commodity = Column(String(50), nullable=False)
    variety = Column(String(100), nullable=True)
    data_source = Column(String(50), nullable=False)
    etl_cadence = Column(String(20), nullable=False)
    price_movement_wow = Column(DECIMAL(10, 2), nullable=True)
    forecast_date = Column(Date, nullable=False)
    forecast_price_low = Column(DECIMAL(10, 2), nullable=False)
    forecast_price_high = Column(DECIMAL(10, 2), nullable=False)
    generated_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )