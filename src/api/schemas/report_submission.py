from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ============================================================
# BASE
# ============================================================

class ReportSubmissionBase(BaseModel):
    report_id: int


# ============================================================
# CREATE
# ============================================================

class ReportSubmissionCreate(ReportSubmissionBase):
    status: str = "DRAFT"


# ============================================================
# UPDATE
# ============================================================

class ReportSubmissionUpdate(BaseModel):
    status: Optional[str] = None

    current_validator_id: Optional[int] = None

    current_validator_role: Optional[str] = None

    revision_remarks: Optional[str] = None

    revision_count: Optional[int] = None

    submitted_at: Optional[datetime] = None

    approved_at: Optional[datetime] = None


# ============================================================
# RESPONSE
# ============================================================

class ReportSubmissionResponse(ReportSubmissionBase):
    submission_id: int

    status: str

    current_validator_id: Optional[int] = None

    current_validator_role: Optional[str] = None

    revision_remarks: Optional[str] = None

    revision_count: int

    submitted_at: Optional[datetime] = None

    approved_at: Optional[datetime] = None

    created_at: datetime

    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


# ============================================================
# SUBMIT RESPONSE
# ============================================================

class ReportSubmissionSubmitResponse(BaseModel):
    message: str

    report_id: int

    submission_id: int

    status: str

    current_validator_id: Optional[int] = None

    current_validator_role: Optional[str] = None


# ============================================================
# APPROVAL / REVISION REQUEST
# ============================================================

class ReportValidationRequest(BaseModel):
    validator_id: int

    validator_role: str

    remarks: Optional[str] = None


# ============================================================
# REVISION REQUEST
# ============================================================

class ReportRevisionRequest(BaseModel):
    validator_id: int

    validator_role: str

    remarks: str


# ============================================================
# VALIDATION HISTORY RESPONSE
# ============================================================

class ReportValidationHistoryResponse(BaseModel):
    history_id: int

    action: str

    performed_by: int

    role: str

    remarks: Optional[str] = None

    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )