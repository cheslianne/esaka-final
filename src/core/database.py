from urllib.parse import quote_plus

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from contextvars import ContextVar
from datetime import date, datetime
from decimal import Decimal

from src.core.config import settings


# =========================================================
# DATABASE CONNECTION
# =========================================================

def _build_database_url() -> str:
    """Use the provider URL first, with DB_* kept for local compatibility."""
    if settings.database_url:
        return settings.database_url.replace("postgres://", "postgresql://", 1)

    legacy_values = {
        "DB_HOST": settings.db_host,
        "DB_PORT": settings.db_port,
        "DB_NAME": settings.db_name,
        "DB_USER": settings.db_user,
        "DB_PASSWORD": settings.db_password,
    }
    missing = [name for name, value in legacy_values.items() if value is None]
    if missing:
        raise RuntimeError(
            "Database configuration is incomplete. Set DATABASE_URL or all "
            f"legacy variables: {', '.join(missing)}."
        )

    return (
        f"postgresql://{settings.db_user}:{quote_plus(settings.db_password)}"
        f"@{settings.db_host}:{settings.db_port}/{settings.db_name}"
    )


SQLALCHEMY_DATABASE_URL = _build_database_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


# =========================================================
# AUDIT CONTEXT
# =========================================================

current_user_id = ContextVar(
    "current_user_id",
    default=None
)

current_ip_address = ContextVar(
    "current_ip_address",
    default=None
)

current_user_agent = ContextVar(
    "current_user_agent",
    default=None
)


# =========================================================
# HELPER
# =========================================================

def make_json_serializable(value):

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, dict):
        return {
            key: make_json_serializable(val)
            for key, val in value.items()
        }

    if isinstance(value, list):
        return [
            make_json_serializable(item)
            for item in value
        ]

    return value


def get_model_values(obj):

    values = {}

    mapper = inspect(obj).mapper

    for column in mapper.columns:

        if column.name == "created_at":
            continue

        value = getattr(
            obj,
            column.name,
            None
        )

        values[column.name] = (
            make_json_serializable(value)
        )

    return values


# =========================================================
# AUTOMATIC AUDIT LOGGING
# =========================================================

print(">>> AUDIT SYSTEM LOADED")


@event.listens_for(Session, "after_flush")
def create_audit_logs(
    session,
    flush_context
):

    print(">>> AUDIT LISTENER TRIGGERED")

    from src.models.audit_logs import AuditLog

    user_id = current_user_id.get()

    print(
        ">>> CURRENT USER ID:",
        user_id
    )

    if user_id is None:

        print(
            ">>> NO USER ID - AUDIT SKIPPED"
        )

        return

    ip_address = current_ip_address.get()

    user_agent = current_user_agent.get()

    audit_entries = []


    # =====================================================
    # CREATE
    # =====================================================

    for obj in session.new:

        if isinstance(obj, AuditLog) or getattr(obj, "__audit_skip__", False):
            continue

        mapper = inspect(obj).mapper

        primary_key = mapper.primary_key

        if not primary_key:
            continue

        resource_id = getattr(
            obj,
            primary_key[0].name,
            None
        )

        if resource_id is None:
            continue

        audit_entries.append(
            AuditLog(
                user_id=user_id,
                action="CREATE",
                resource_type=obj.__tablename__,
                resource_id=resource_id,
                old_values=None,
                new_values=get_model_values(obj),
                ip_address=ip_address,
                user_agent=user_agent
            )
        )


    # =====================================================
    # UPDATE
    # =====================================================

    for obj in session.dirty:

        if isinstance(obj, AuditLog) or getattr(obj, "__audit_skip__", False):
            continue

        state = inspect(obj)

        if not state.modified:
            continue

        mapper = state.mapper

        primary_key = mapper.primary_key

        if not primary_key:
            continue

        resource_id = getattr(
            obj,
            primary_key[0].name,
            None
        )

        if resource_id is None:
            continue

        old_values = {}
        new_values = {}

        for column in mapper.columns:

            if column.name == "created_at":
                continue

            history = (
                state.attrs[column.name].history
            )

            if not history.has_changes():
                continue

            old_value = (
                history.deleted[0]
                if history.deleted
                else None
            )

            new_value = getattr(
                obj,
                column.name,
                None
            )

            old_values[column.name] = (
                make_json_serializable(
                    old_value
                )
            )

            new_values[column.name] = (
                make_json_serializable(
                    new_value
                )
            )

        if old_values or new_values:

            audit_entries.append(
                AuditLog(
                    user_id=user_id,
                    action="UPDATE",
                    resource_type=obj.__tablename__,
                    resource_id=resource_id,
                    old_values=old_values,
                    new_values=new_values,
                    ip_address=ip_address,
                    user_agent=user_agent
                )
            )


    # =====================================================
    # DELETE
    # =====================================================

    for obj in session.deleted:

        if isinstance(obj, AuditLog) or getattr(obj, "__audit_skip__", False):
            continue

        mapper = inspect(obj).mapper

        primary_key = mapper.primary_key

        if not primary_key:
            continue

        resource_id = getattr(
            obj,
            primary_key[0].name,
            None
        )

        if resource_id is None:
            continue

        audit_entries.append(
            AuditLog(
                user_id=user_id,
                action="DELETE",
                resource_type=obj.__tablename__,
                resource_id=resource_id,
                old_values=get_model_values(obj),
                new_values=None,
                ip_address=ip_address,
                user_agent=user_agent
            )
        )


    # =====================================================
    # SAVE AUDIT RECORDS
    # =====================================================

    for audit_entry in audit_entries:
        session.add(audit_entry)


# =========================================================
# DATABASE DEPENDENCY
# =========================================================

def get_db():

    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()