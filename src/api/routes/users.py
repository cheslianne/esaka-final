from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from src.core.database import get_db
from src.models.users import User
from src.models.audit_logs import AuditLog
from src.models.farmers import Farmer
from src.models.raw_plant_reports import RawPlantReport
from src.models.report_submission import ReportSubmission
from src.models.report_validation_history import ReportValidationHistory

from src.api.schemas.users import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserStatusUpdate,
    UserArchiveUpdate
)

from datetime import datetime, timezone

from src.core.security import hash_password
from src.core.rbac import require_role, Role
from src.core.auth import get_current_user


router = APIRouter()

ROLE_ALIASES = {
    "AEW": Role.AEW.value,
    "DA-RFO": Role.DA_RFO_OFFICER.value,
}
VALID_ROLES = {role.value for role in Role}


def normalize_role(role: str) -> str:
    normalized = ROLE_ALIASES.get((role or "").strip(), (role or "").strip())
    if normalized not in VALID_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    return normalized


# ============================================================
# CREATE USER
# ONLY SYSTEM ADMINISTRATOR
# ============================================================

@router.post(
    "",
    response_model=UserResponse,
    dependencies=[Depends(require_role(Role.SYSTEM_ADMIN))]
)
def create_user(
    user: UserCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new user.

    Automatically creates:
    USER_CREATED
    """

    # CHECK USERNAME
    existing_username = (
        db.query(User)
        .filter(User.username == user.username)
        .first()
    )

    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )

    # CHECK EMAIL
    existing_email = (
        db.query(User)
        .filter(
            User.email_address == user.email_address
        )
        .first()
    )

    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already exists"
        )

    # HASH PASSWORD
    hashed_password = hash_password(user.password)

    user_data = user.dict()
    user_data["password"] = hashed_password
    user_data["role"] = normalize_role(user_data["role"])
    user_data["is_active"] = True

    # CREATE USER
    db_user = User(**user_data)
    db.add(db_user)
    db.flush()

    # AUDIT LOG
    audit_log = AuditLog(
        user_id=current_user.user_id,
        action="USER_CREATED",
        resource_type="User",
        resource_id=db_user.user_id,
        old_values=None,
        new_values={
            "user_id": db_user.user_id,
            "first_name": db_user.first_name,
            "last_name": db_user.last_name,
            "username": db_user.username,
            "email_address": db_user.email_address,
            "phone_number": db_user.phone_number,
            "role": db_user.role,
            "region": db_user.region,
            "province": db_user.province,
            "municipality": db_user.municipality,
            "is_active": db_user.is_active,
        },
        ip_address=(
            request.client.host
            if request.client
            else None
        ),
        user_agent=request.headers.get("user-agent")
    )

    db.add(audit_log)

    db.commit()
    db.refresh(db_user)

    return db_user


# ============================================================
# GET ALL USERS
# ONLY SYSTEM ADMINISTRATOR
# ============================================================

@router.get(
    "",
    response_model=list[UserResponse],
    dependencies=[Depends(require_role(Role.SYSTEM_ADMIN))]
)
def read_users(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all users.

    Automatically creates:
    USERS_VIEWED
    """

    users = (
        db.query(User)
        .filter(User.is_archived.is_(False))
        .order_by(User.user_id.asc())
        .all()
    )

    audit_log = AuditLog(
        user_id=current_user.user_id,
        action="USERS_VIEWED",
        resource_type="User",
        resource_id=current_user.user_id,
        old_values=None,
        new_values={"count": len(users)},
        ip_address=(
            request.client.host
            if request.client
            else None
        ),
        user_agent=request.headers.get("user-agent")
    )

    db.add(audit_log)
    db.commit()

    return users


# ============================================================
# GET ARCHIVED USERS
# ONLY SYSTEM ADMINISTRATOR
# ============================================================

@router.get(
    "/archived",
    response_model=list[UserResponse],
    dependencies=[Depends(require_role(Role.SYSTEM_ADMIN))]
)
def read_archived_users(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all archived users.

    Automatically creates:
    ARCHIVED_USERS_VIEWED
    """

    users = (
        db.query(User)
        .filter(User.is_archived.is_(True))
        .order_by(User.archived_at.desc())
        .all()
    )

    # ✅ Build response with archived_by_name (full name)
    result = []
    for user in users:
        user_dict = {
            "user_id": user.user_id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "username": user.username,
            "email_address": user.email_address,
            "phone_number": user.phone_number,
            "role": user.role,
            "region": user.region,
            "province": user.province,
            "municipality": user.municipality,
            "is_active": user.is_active,
            "is_archived": user.is_archived,
            "archived_at": user.archived_at,
            "archive_remarks": user.archive_remarks,
            "archived_by": user.archived_by,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
            "archived_by_name": None,
        }

        # Hanapin yung admin na nag-archive
        if user.archived_by:
            admin = (
                db.query(User)
                .filter(User.user_id == user.archived_by)
                .first()
            )
            if admin:
                # ✅ Full name: "First Last"
                user_dict["archived_by_name"] = (
                    f"{admin.first_name} {admin.last_name}"
                )

        result.append(user_dict)

    # AUDIT LOG
    audit_log = AuditLog(
        user_id=current_user.user_id,
        action="ARCHIVED_USERS_VIEWED",
        resource_type="User",
        resource_id=current_user.user_id,
        old_values=None,
        new_values={"count": len(users)},
        ip_address=(
            request.client.host
            if request.client
            else None
        ),
        user_agent=request.headers.get("user-agent")
    )

    db.add(audit_log)
    db.commit()

    return result

# ============================================================
# GET USER BY ID
# ============================================================

@router.get(
    "/{user_id}",
    response_model=UserResponse
)
def read_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a user by ID.

    Automatically creates:
    USER_VIEWED
    """

    db_user = (
        db.query(User)
        .filter(User.user_id == user_id)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # PERMISSION
    if (
        current_user.user_id != user_id
        and current_user.role != Role.SYSTEM_ADMIN
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own profile"
        )

    # AUDIT LOG
    audit_log = AuditLog(
        user_id=current_user.user_id,
        action="USER_VIEWED",
        resource_type="User",
        resource_id=db_user.user_id,
        old_values=None,
        new_values={"username": db_user.username},
        ip_address=(
            request.client.host
            if request.client
            else None
        ),
        user_agent=request.headers.get("user-agent")
    )

    db.add(audit_log)
    db.commit()

    return db_user


# ============================================================
# UPDATE USER
# ============================================================

@router.put(
    "/{user_id}",
    response_model=UserResponse
)
def update_user(
    user_id: int,
    user: UserUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a user.

    Automatically creates:
    USER_UPDATED
    """

    db_user = (
        db.query(User)
        .filter(User.user_id == user_id)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # PERMISSION
    if (
        current_user.user_id != user_id
        and current_user.role != Role.SYSTEM_ADMIN
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own profile"
        )

    # OLD VALUES
    old_values = {
        "first_name": db_user.first_name,
        "last_name": db_user.last_name,
        "username": db_user.username,
        "email_address": db_user.email_address,
        "phone_number": db_user.phone_number,
        "role": db_user.role,
        "is_active": db_user.is_active
    }

    # UPDATE DATA
    update_data = user.dict(exclude_unset=True)

    # ONLY ADMIN CAN CHANGE ROLE
    if (
        "role" in update_data
        and current_user.role != Role.SYSTEM_ADMIN
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only System Administrators can change user roles"
        )

    if "role" in update_data:
        update_data["role"] = normalize_role(update_data["role"])
        role_is_changing = update_data["role"] != db_user.role

        if role_is_changing and db_user.user_id == current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own role"
            )

        if role_is_changing and db_user.role == Role.SYSTEM_ADMIN:
            other_admins = (
                db.query(User)
                .filter(
                    User.role == Role.SYSTEM_ADMIN,
                    User.is_active.is_(True),
                    User.is_archived.is_(False),
                    User.user_id != db_user.user_id,
                )
                .count()
            )
            if other_admins == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot change the role of the last active System Administrator"
                )

    if update_data.get("username") not in (None, db_user.username):
        if db.query(User).filter(
            User.username == update_data["username"],
            User.user_id != db_user.user_id,
        ).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

    if update_data.get("email_address") not in (None, db_user.email_address):
        if db.query(User).filter(
            User.email_address == update_data["email_address"],
            User.user_id != db_user.user_id,
        ).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email address already exists")

    # HASH NEW PASSWORD
    if "password" in update_data:
        update_data["password"] = hash_password(
            update_data["password"]
        )

    # APPLY UPDATE
    for key, value in update_data.items():
        setattr(db_user, key, value)

    db.flush()

    # NEW VALUES
    new_values = {
        "first_name": db_user.first_name,
        "last_name": db_user.last_name,
        "username": db_user.username,
        "email_address": db_user.email_address,
        "phone_number": db_user.phone_number,
        "role": db_user.role,
        "is_active": db_user.is_active
    }

    # AUDIT LOG
    audit_log = AuditLog(
        user_id=current_user.user_id,
        action="USER_UPDATED",
        resource_type="User",
        resource_id=db_user.user_id,
        old_values=old_values,
        new_values=new_values,
        ip_address=(
            request.client.host
            if request.client
            else None
        ),
        user_agent=request.headers.get("user-agent")
    )

    db.add(audit_log)

    db.commit()
    db.refresh(db_user)

    return db_user


# ============================================================
# ACTIVATE / DEACTIVATE USER
# ONLY SYSTEM ADMINISTRATOR
# ============================================================

@router.patch(
    "/{user_id}/status",
    response_model=UserResponse,
    dependencies=[Depends(require_role(Role.SYSTEM_ADMIN))]
)
def update_user_status(
    user_id: int,
    status_update: UserStatusUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Activate or deactivate a user.

    Automatically creates:
    USER_ACTIVATED
    USER_DEACTIVATED
    """

    db_user = (
        db.query(User)
        .filter(User.user_id == user_id)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if db_user.user_id == current_user.user_id and status_update.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account"
        )

    # PREVENT DEACTIVATING LAST ADMIN
    if (
        db_user.role == Role.SYSTEM_ADMIN
        and status_update.is_active is False
    ):
        active_admin_count = (
            db.query(User)
            .filter(
                User.role == Role.SYSTEM_ADMIN,
                User.is_active.is_(True)
            )
            .count()
        )

        if active_admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate the last active System Administrator"
            )

    old_status = db_user.is_active
    new_status = status_update.is_active

    if old_status == new_status:
        status_text = "active" if new_status else "inactive"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User is already {status_text}"
        )

    db_user.is_active = new_status

    action = "USER_ACTIVATED" if new_status else "USER_DEACTIVATED"

    audit_log = AuditLog(
        user_id=current_user.user_id,
        action=action,
        resource_type="User",
        resource_id=db_user.user_id,
        old_values={"is_active": old_status},
        new_values={"is_active": new_status},
        ip_address=(
            request.client.host
            if request.client
            else None
        ),
        user_agent=request.headers.get("user-agent")
    )

    db.add(audit_log)

    db.commit()
    db.refresh(db_user)

    return db_user


# ============================================================
# ARCHIVE / RESTORE USER
# ONLY SYSTEM ADMINISTRATOR
# ============================================================

@router.patch(
    "/{user_id}/archive",
    response_model=UserResponse,
    dependencies=[Depends(require_role(Role.SYSTEM_ADMIN))]
)
def archive_user(
    user_id: int,
    archive_update: UserArchiveUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Archive or restore a user.

    Automatically creates:
    USER_ARCHIVED
    USER_RESTORED
    """

    # FIND USER
    db_user = (
        db.query(User)
        .filter(User.user_id == user_id)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # PREVENT SELF-ARCHIVE
    if db_user.user_id == current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot archive your own account"
        )

    # PREVENT ARCHIVING LAST ADMIN
    if (
        archive_update.is_archived is True
        and db_user.role == Role.SYSTEM_ADMIN
    ):
        admin_count = (
            db.query(User)
            .filter(
                User.role == Role.SYSTEM_ADMIN,
                User.is_archived.is_(False)
            )
            .count()
        )

        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot archive the last System Administrator"
            )

    # ✅ VALIDATE REMARKS KAPAG NAG-A-ARCHIVE
    if archive_update.is_archived is True:
        if not archive_update.remarks or not archive_update.remarks.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Remarks is required when archiving a user."
            )

    # SAME STATUS CHECK
    old_archived = db_user.is_archived
    new_archived = archive_update.is_archived

    if old_archived == new_archived:
        status_text = "archived" if new_archived else "not archived"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User is already {status_text}"
        )

    # APPLY ARCHIVE / RESTORE
    old_is_active = db_user.is_active
    db_user.is_archived = new_archived

    if new_archived:
        # Archive → also deactivate + save remarks
        db_user.archived_at = func.now()
        db_user.is_active = False
        db_user.archive_remarks = archive_update.remarks.strip()
        db_user.archived_by = current_user.user_id
    else:
        # Restore → reactivate + clear archive metadata
        db_user.archived_at = None
        db_user.is_active = True
        db_user.archive_remarks = None
        db_user.archived_by = None

    # DETERMINE ACTION
    action = "USER_ARCHIVED" if new_archived else "USER_RESTORED"

    # AUDIT LOG
    audit_log = AuditLog(
        user_id=current_user.user_id,
        action=action,
        resource_type="User",
        resource_id=db_user.user_id,
        old_values={
            "is_archived": old_archived,
            "is_active": old_is_active,
        },
        new_values={
            "is_archived": new_archived,
            "is_active": db_user.is_active,
            "archive_remarks": db_user.archive_remarks,
            "archived_by": db_user.archived_by,
        },
        ip_address=(
            request.client.host
            if request.client
            else None
        ),
        user_agent=request.headers.get("user-agent")
    )

    db.add(audit_log)

    db.commit()
    db.refresh(db_user)

    return db_user


# ============================================================
# DELETE USER
# ONLY SYSTEM ADMINISTRATOR
# ============================================================

@router.delete(
    "/{user_id}",
    dependencies=[Depends(require_role(Role.SYSTEM_ADMIN))]
)
def delete_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a user.

    Automatically creates:
    USER_DELETED
    """

    db_user = (
        db.query(User)
        .filter(User.user_id == user_id)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if db_user.user_id == current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account"
        )

    linked = {
        "farmers": db.query(Farmer).filter(Farmer.aew_id == user_id).count(),
        "plant reports": db.query(RawPlantReport).filter(RawPlantReport.encoded_by == user_id).count(),
        "report submissions": db.query(ReportSubmission).filter(ReportSubmission.current_validator_id == user_id).count(),
        "validation records": db.query(ReportValidationHistory).filter(ReportValidationHistory.performed_by == user_id).count(),
        "audit log entries": db.query(AuditLog).filter(AuditLog.user_id == user_id).count(),
    }
    linked = {label: count for label, count in linked.items() if count}
    if linked:
        summary = ", ".join(f"{count} {label}" for label, count in linked.items())
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This user has linked records ({summary}) and cannot be deleted. "
                "Archive the account instead to keep those records intact."
            )
        )

    # PREVENT DELETING LAST ADMIN
    if db_user.role == Role.SYSTEM_ADMIN:
        admin_count = (
            db.query(User)
            .filter(User.role == Role.SYSTEM_ADMIN)
            .count()
        )

        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last System Administrator"
            )

    old_values = {
        "user_id": db_user.user_id,
        "first_name": db_user.first_name,
        "last_name": db_user.last_name,
        "username": db_user.username,
        "email_address": db_user.email_address,
        "phone_number": db_user.phone_number,
        "role": db_user.role,
        "is_active": db_user.is_active
    }

    deleted_user_id = db_user.user_id

    # AUDIT LOG
    audit_log = AuditLog(
        user_id=current_user.user_id,
        action="USER_DELETED",
        resource_type="User",
        resource_id=deleted_user_id,
        old_values=old_values,
        new_values=None,
        ip_address=(
            request.client.host
            if request.client
            else None
        ),
        user_agent=request.headers.get("user-agent")
    )

    db.add(audit_log)

    db.delete(db_user)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This user is referenced by other records and cannot be deleted. "
                "Archive the account instead."
            )
        )

    return {
        "detail": "User deleted successfully"
    }