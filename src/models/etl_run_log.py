from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    text
)

from src.core.database import Base


class ETLRunLog(Base):
    __tablename__ = "etl_run_log"

    etl_log_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    run_date_time = Column(
        DateTime,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False
    )

    data_source = Column(
        String(100),
        nullable=False
    )

    status = Column(
        String(20),
        nullable=False
    )

    error_message = Column(
        Text,
        nullable=True
    )