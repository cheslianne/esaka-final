from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any


class AuditLogBase(BaseModel):
    user_id: int
    
    action: str
    resource_type: str
    resource_id: int
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class AuditLogCreate(AuditLogBase):
    pass


class AuditLogUpdate(BaseModel):
    action: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[int] = None
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class AuditLogResponse(AuditLogBase):
    log_id: int
    created_at: datetime
    user_name: str 

    class Config:
        from_attributes = True