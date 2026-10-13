# src/models/users.py

from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime,
    Boolean,
    Index,
    func,
)
from sqlalchemy.orm import relationship

from src.core.database import Base


class User(Base):
    __tablename__ = "users"

    # ============================================================
    # PRIMARY KEY
    # ============================================================

    user_id = Column(Integer, primary_key=True, index=True)

    # ============================================================
    # USER INFORMATION
    # ============================================================

    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email_address = Column(String(100), unique=True, nullable=False)
    phone_number = Column(String(15), nullable=False)
    birthdate = Column(Date, nullable=True)

    # ============================================================
    # AUTHENTICATION
    # ============================================================

    password = Column(String(255), nullable=False)
    failed_login_attempts = Column(
        Integer,
        nullable=False,
        server_default="0",
    )
    locked_until = Column(DateTime, nullable=True)

    # ============================================================
    # PASSWORD RESET
    # ============================================================

    reset_token = Column(String(255), unique=True, nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)

    # ============================================================
    # ROLE
    # ============================================================

    role = Column(String(30), nullable=False)

    # ============================================================
    # LOCATION
    # ============================================================

    region = Column(String(100), nullable=True)
    province = Column(String(100), nullable=True)
    municipality = Column(String(100), nullable=True)

    # ============================================================
    # ACCOUNT STATUS
    # ============================================================

    is_active = Column(Boolean, nullable=False, server_default="true")
    # ============================================================


# ============================================================
# ARCHIVE
# ============================================================

    is_archived = Column(Boolean, nullable=False, server_default="false", index=True)
    archived_at = Column(DateTime, nullable=True)
    archive_remarks = Column(String, nullable=True)        # ✅ BAGO
    archived_by = Column(Integer, nullable=True)   

    # ============================================================
    # TIMESTAMPS
    # ============================================================

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ============================================================
    # RELATIONSHIPS
    # ============================================================

    audit_logs = relationship("AuditLog", back_populates="user")
    raw_plant_reports = relationship("RawPlantReport", back_populates="user")
    farmers = relationship("Farmer", back_populates="aew")

    # ============================================================
    # INDEXES
    # ============================================================

    __table_args__ = (
        Index("idx_users_location", "region", "province", "municipality"),
    )