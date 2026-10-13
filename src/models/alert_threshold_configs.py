from datetime import datetime

from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime

from src.core.database import Base


class AlertThresholdConfig(Base):
    __tablename__ = "alert_threshold_configs"

    id = Column(Integer, primary_key=True, index=True)

    commodity = Column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    # DA-defined target demand in kg
    base_demand = Column(
        Numeric(14, 2),
        nullable=False,
    )

    # Example: 120 means 120%
    oversupply_threshold = Column(
        Numeric(5, 2),
        nullable=False,
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    created_by = Column(
        Integer,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )