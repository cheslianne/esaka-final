from datetime import datetime

from sqlalchemy import Column, ForeignKey, Integer, Numeric, String, DateTime

from src.core.database import Base


class AlertThresholdConfigHistory(Base):
    """Audit trail: one row per saved change to an alert threshold."""

    __tablename__ = "alert_threshold_config_history"

    id = Column(Integer, primary_key=True, index=True)

    commodity = Column(String(50), nullable=False, index=True)

    # Values after the change
    base_demand = Column(Numeric(14, 2), nullable=False)
    oversupply_threshold = Column(Numeric(5, 2), nullable=False)

    # Values before the change (NULL for the first configuration of a commodity)
    previous_base_demand = Column(Numeric(14, 2), nullable=True)
    previous_oversupply_threshold = Column(Numeric(5, 2), nullable=True)

    # Who made the change. The name is a snapshot, so the entry stays
    # readable even if the user is later renamed or removed.
    changed_by = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    changed_by_name = Column(String(120), nullable=False)

    # Stored as naive UTC, same convention as the other tables
    changed_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        index=True,
<<<<<<< HEAD
    )
=======
    )
>>>>>>> origin/new-merge-jhelo
