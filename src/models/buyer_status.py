from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    TIMESTAMP,
    text
)
from sqlalchemy.orm import relationship

from src.core.database import Base


class BuyerStatus(Base):
    __tablename__ = "buyer_status"

    buyer_status_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    buyer_registry_id = Column(
        Integer,
        ForeignKey(
            "buyer_registry.buyer_registry_id"
        ),
        nullable=False,
        unique=True
    )

    status = Column(
        String(20),
        nullable=False,
        default="Pending",
        server_default="Pending"
    )

    reviewed_at = Column(
        TIMESTAMP,
        server_default=text(
            "CURRENT_TIMESTAMP"
        )
    )

    buyer_registry = relationship(
        "BuyerRegistry",
        back_populates="buyer_status"
    )