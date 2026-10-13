# src/core/rbac.py
from enum import Enum
from typing import Set
from fastapi import HTTPException, Depends, status
from src.core.auth import get_current_user
from src.models.users import User

class Role(str, Enum):
    SYSTEM_ADMIN = "System Administrator"
    DA_RFO_OFFICER = "DA-RFO Officer"
    PROVINCIAL_COORDINATOR = "Provincial Coordinator"
    MUNICIPAL_COORDINATOR = "Municipal Coordinator"
    AEW = "Agricultural Extension Worker"

ROLE_PERMISSIONS: dict[Role, Set[str]] = {
    Role.SYSTEM_ADMIN: {"manage_users", "monitor_etl", "trigger_etl", "view_system_logs", "view_all_data"},
    Role.DA_RFO_OFFICER: {"approve_buyer", "view_map", "view_planting_supply", "configure_thresholds", "view_all_data"},
    Role.PROVINCIAL_COORDINATOR: {"view_map", "view_municipal_data", "validate_reports", "view_provincial_data"},
    Role.MUNICIPAL_COORDINATOR: {"view_map", "view_aew_data", "submit_municipal_report", "view_municipal_data"},
    Role.AEW: {"view_map", "register_farmers", "submit_planting_intents", "create_offtake_requests", "view_price_dashboard"},
}

def get_user_permissions(role: Role) -> Set[str]:
    return ROLE_PERMISSIONS.get(role, set())

def require_permission(required_permission: str):
    def permission_dependency(current_user: User = Depends(get_current_user)):
        if current_user.role == Role.SYSTEM_ADMIN:
            return current_user
        user_permissions = get_user_permissions(current_user.role)
        if required_permission not in user_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Requires '{required_permission}' permission."
            )
        return current_user
    return permission_dependency

def require_role(*allowed_roles: Role):
    def role_dependency(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            allowed_role_names = [r.value for r in allowed_roles]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_role_names)}. Your role: {current_user.role}"
            )
        return current_user
    return role_dependency

def user_has_permission(user: User, permission: str) -> bool:
    if user.role == Role.SYSTEM_ADMIN:
        return True
    return permission in get_user_permissions(user.role)