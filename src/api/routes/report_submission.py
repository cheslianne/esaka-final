# src/api/routes/report_submission.py
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.core.auth import get_current_user

from src.models.raw_plant_reports import RawPlantReport
from src.models.report_submission import ReportSubmission
from src.models.report_validation_history import ReportValidationHistory
from src.models.planting_intents import PlantingIntent
from src.models.report_planting_intents import ReportPlantingIntent
from src.models.users import User
from datetime import datetime, timedelta, timezone
from src.models.farmers import Farmer
from src.models.report_planting_intents import ReportPlantingIntent
from src.models.planting_intents import PlantingIntent

router = APIRouter()


# ============================================================
# STATUS VALUES
# ============================================================

from src.models.report_status import ReportStatus

DRAFT = ReportStatus.DRAFT.value
SUBMITTED_MUNICIPAL_PENDING = ReportStatus.SUBMITTED_MUNICIPAL_PENDING.value
SUBMITTED_MUNICIPAL_FLAGGED = ReportStatus.SUBMITTED_MUNICIPAL_FLAGGED.value
SUBMITTED_PROVINCIAL_PENDING = ReportStatus.SUBMITTED_PROVINCIAL_PENDING.value
SUBMITTED_PROVINCIAL_FLAGGED = ReportStatus.SUBMITTED_PROVINCIAL_FLAGGED.value
SUBMITTED_REGIONAL_PENDING = ReportStatus.SUBMITTED_REGIONAL_PENDING.value
SUBMITTED_REGIONAL_FLAGGED = ReportStatus.SUBMITTED_REGIONAL_FLAGGED.value
SUBMITTED_REGIONAL_APPROVED = ReportStatus.SUBMITTED_REGIONAL_APPROVED.value

FOR_MUNICIPAL_VALIDATION = SUBMITTED_MUNICIPAL_PENDING
FOR_PROVINCIAL_VALIDATION = SUBMITTED_PROVINCIAL_PENDING
FOR_DA_RFO_VALIDATION = SUBMITTED_REGIONAL_PENDING
REVISION_REQUIRED = SUBMITTED_MUNICIPAL_FLAGGED
FINAL_APPROVED = SUBMITTED_REGIONAL_APPROVED


# ============================================================
# HELPERS — APPEND REMARKS
# ============================================================

def append_remarks(existing: str | None, new: str | None) -> str | None:
    """
    Append new remarks to existing with a separator.
    Returns the combined remarks string, or None if both are empty.
    """
    if not new or not new.strip():
        return existing

    new_clean = new.strip()

    if existing and existing.strip():
        return f"{existing.strip()}\n\n---\n\n{new_clean}"

    return new_clean


# ============================================================
# SUBMIT REPORT
# ============================================================

@router.post("/{report_id}/submit")
def submit_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(RawPlantReport).filter(RawPlantReport.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    submission = db.query(ReportSubmission).filter(ReportSubmission.report_id == report_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Report submission not found.")

    submittable_statuses = (DRAFT, SUBMITTED_MUNICIPAL_FLAGGED, SUBMITTED_PROVINCIAL_FLAGGED, SUBMITTED_REGIONAL_FLAGGED)
    if submission.status not in submittable_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Report can only be submitted from DRAFT or FLAGGED status. Current: {submission.status}"
        )

    submission.status = SUBMITTED_MUNICIPAL_PENDING
    submission.current_validator_id = report.municipal_coordinator_id
    submission.current_validator_role = "municipal_coordinator"
    submission.revision_count = submission.revision_count or 0
    submission.submitted_at = datetime.utcnow()

    history = ReportValidationHistory(
        submission_id=submission.submission_id,
        action="SUBMITTED",
        performed_by=report.encoded_by,
        role="aew",
        remarks=None,
    )

    db.add(history)
    db.commit()
    db.refresh(submission)

    return {
        "message": "Report submitted successfully.",
        "report_id": report_id,
        "submission_id": submission.submission_id,
        "status": submission.status,
    }


# ============================================================
# APPROVE REPORT
# ============================================================

@router.post("/{report_id}/approve")
def approve_report(
    report_id: int,
    validator_id: int,
    validator_role: str,
    remarks: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    submission = db.query(ReportSubmission).filter(ReportSubmission.report_id == report_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Report submission not found.")

    if current_user.user_id != validator_id:
        raise HTTPException(status_code=403, detail="You are not authorized to approve this report.")

    # ============================================================
    # MUNICIPAL COORDINATOR
    # ============================================================
    if validator_role == "municipal_coordinator":
        allowed_statuses = [
            SUBMITTED_MUNICIPAL_PENDING,
            SUBMITTED_PROVINCIAL_FLAGGED,
            SUBMITTED_REGIONAL_FLAGGED,
        ]

        if submission.status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Report is not awaiting municipal validation. Current: {submission.status}"
            )

        submission.status = SUBMITTED_PROVINCIAL_PENDING
        submission.current_validator_id = None
        submission.current_validator_role = "provincial_coordinator"
        submission.submitted_at = datetime.utcnow()

    # ============================================================
    # PROVINCIAL COORDINATOR
    # ============================================================
    elif validator_role == "provincial_coordinator":
        allowed_statuses = [
            SUBMITTED_PROVINCIAL_PENDING,
            SUBMITTED_REGIONAL_FLAGGED,
        ]

        if submission.status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Report is not awaiting provincial validation. Current: {submission.status}"
            )

        submission.status = SUBMITTED_REGIONAL_PENDING
        submission.current_validator_id = None
        submission.current_validator_role = "darfo"
        submission.submitted_at = datetime.utcnow()

    # ============================================================
    # DA-RFO OFFICER
    # ============================================================
    elif validator_role == "darfo":
        if submission.status != SUBMITTED_REGIONAL_PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Report is not awaiting DA-RFO validation. Current: {submission.status}"
            )

        submission.status = SUBMITTED_REGIONAL_APPROVED
        submission.current_validator_id = None
        submission.current_validator_role = None
        submission.approved_at = datetime.utcnow()
        submission.submitted_at = datetime.utcnow()

    else:
        raise HTTPException(status_code=400, detail=f"Invalid validator role: {validator_role}")

    # ============================================================
    # APPEND REMARKS (hindi replace)
    # ============================================================
    submission.revision_remarks = append_remarks(submission.revision_remarks, remarks)

    history = ReportValidationHistory(
        submission_id=submission.submission_id,
        action="APPROVED",
        performed_by=current_user.user_id,
        role=validator_role,
        remarks=remarks,
    )

    db.add(history)
    db.commit()
    db.refresh(submission)

    return {
        "message": "Report approved successfully.",
        "report_id": report_id,
        "status": submission.status,
    }


# ============================================================
# REQUEST REVISION
# ============================================================

@router.post("/{report_id}/revision")
def request_revision(
    report_id: int,
    validator_id: int,
    validator_role: str,
    remarks: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    if current_user.user_id != validator_id:
        raise HTTPException(status_code=403, detail="You are not authorized to request revision.")

    if not remarks or not remarks.strip():
        raise HTTPException(status_code=400, detail="Revision remarks are required.")

    submission = db.query(ReportSubmission).filter(ReportSubmission.report_id == report_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Report submission not found.")

    # ============================================================
    # VALIDATE + SET FLAGGED STATUS
    # ============================================================

    if validator_role == "municipal_coordinator":
        allowed = [SUBMITTED_MUNICIPAL_PENDING, SUBMITTED_PROVINCIAL_FLAGGED, SUBMITTED_REGIONAL_FLAGGED]
        if submission.status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Report is not awaiting municipal validation. Current: {submission.status}"
            )
        submission.status = SUBMITTED_MUNICIPAL_FLAGGED

    elif validator_role == "provincial_coordinator":
        allowed = [SUBMITTED_PROVINCIAL_PENDING, SUBMITTED_REGIONAL_FLAGGED]
        if submission.status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Report is not awaiting provincial validation. Current: {submission.status}"
            )
        submission.status = SUBMITTED_PROVINCIAL_FLAGGED

    elif validator_role == "darfo":
        if submission.status != SUBMITTED_REGIONAL_PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Report is not awaiting DA-RFO validation. Current: {submission.status}"
            )
        submission.status = SUBMITTED_REGIONAL_FLAGGED

    else:
        raise HTTPException(status_code=400, detail=f"Invalid validator role: {validator_role}")

    # ============================================================
    # APPEND REMARKS
    # ============================================================
    submission.revision_remarks = append_remarks(submission.revision_remarks, remarks)

    # Reset validator + set AEW as current handler
    submission.current_validator_id = None
    submission.current_validator_role = "aew"
    submission.revision_count = (submission.revision_count or 0) + 1
    submission.flagged_at = datetime.utcnow()

    # Sync RawPlantReport.status
    report = db.query(RawPlantReport).filter(RawPlantReport.report_id == report_id).first()
    if report:
        report.status = submission.status

    history = ReportValidationHistory(
        submission_id=submission.submission_id,
        action="REVISION_REQUIRED",
        performed_by=current_user.user_id,
        role=validator_role,
        remarks=remarks,
    )

    db.add(history)
    db.commit()
    db.refresh(submission)

    return {
        "message": "Report flagged for revision.",
        "report_id": report_id,
        "status": submission.status,
        "revision_count": submission.revision_count,
    }


# ============================================================
# PULL SUBMISSION (AEW only)
# ============================================================

@router.post("/{report_id}/pull")
def pull_submission(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    if current_user.role != "Agricultural Extension Worker":
        raise HTTPException(status_code=403, detail="Only AEWs can pull submissions.")

    report = db.query(RawPlantReport).filter(RawPlantReport.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    if report.encoded_by != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only pull submissions you encoded.")

    submission = db.query(ReportSubmission).filter(ReportSubmission.report_id == report_id).first()

    if not submission:
        submission = ReportSubmission(
            report_id=report_id,
            status=DRAFT,
            current_validator_id=None,
            current_validator_role=None,
            revision_count=0,
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)

    pullable_statuses = [
        FOR_MUNICIPAL_VALIDATION,
        "SUBMITTED",
        "PENDING",
        FOR_PROVINCIAL_VALIDATION,
    ]

    if submission.status not in pullable_statuses and submission.status != DRAFT:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot pull submission with status: {submission.status}"
        )

    old_status = submission.status
    submission.status = DRAFT
    submission.current_validator_id = None
    submission.current_validator_role = None
    submission.revision_count = (submission.revision_count or 0) + 1

    history = ReportValidationHistory(
        submission_id=submission.submission_id,
        action="PULLED",
        performed_by=current_user.user_id,
        role="aew",
        remarks=f"Pulled from {old_status} for revision.",
    )

    db.add(history)
    db.commit()
    db.refresh(submission)

    return {
        "message": "Submission pulled back to draft successfully.",
        "report_id": report_id,
        "submission_id": submission.submission_id,
        "status": submission.status,
        "revision_count": submission.revision_count,
        "old_status": old_status,
    }


# ============================================================
# GET ALL SUBMITTED REPORTS
# ============================================================

@router.get("/all-reports")
def get_all_submitted_reports(db: Session = Depends(get_db)):
    reports = (
        db.query(ReportSubmission, RawPlantReport, PlantingIntent, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .join(ReportPlantingIntent, ReportPlantingIntent.report_id == RawPlantReport.report_id)
        .join(PlantingIntent, PlantingIntent.planting_intent_id == ReportPlantingIntent.planting_intent_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    return [
        {
            "submission_id": submission.submission_id,
            "report_id": submission.report_id,
            "title": report.title,
            "commodity": report.commodity,
            "municipality": report.municipality,
            "planting_date": report.planting_date,
            "harvest_date": planting_intent.harvest_date,
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "encoded_by_name": f"{user.first_name} {user.last_name}" if user else None,
            "status": submission.status,
            "submitted_at": submission.submitted_at,
            "revision_remarks": submission.revision_remarks,
            "revision_count": submission.revision_count,
        }
        for submission, report, planting_intent, user in reports
    ]


# ============================================================
# GET REPORTS FOR MUNICIPAL VALIDATION
# ============================================================

@router.get("/for-municipal-validation")
def get_reports_for_municipal_validation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "Municipal Coordinator":
        raise HTTPException(status_code=403, detail="Unauthorized.")

    valid_statuses = [FOR_MUNICIPAL_VALIDATION, "SUBMITTED_MUNICIPAL_PENDING"]

    mcoor_municipality = db.execute(
        text("SELECT municipality FROM users WHERE user_id = :uid"),
        {"uid": current_user.user_id}
    ).scalar()

    if not mcoor_municipality:
        return []

    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(
            ReportSubmission.status.in_(valid_statuses),
            RawPlantReport.municipality == mcoor_municipality,
        )
        .order_by(ReportSubmission.submitted_at.desc())
        .distinct()
        .all()
    )

    report_ids = [s.report_id for s, r, u in reports]

    intents_map = {}
    if report_ids:
        links = (
            db.query(ReportPlantingIntent)
            .filter(ReportPlantingIntent.report_id.in_(report_ids))
            .all()
        )

        link_by_report = {}
        for link in links:
            link_by_report.setdefault(link.report_id, []).append(link)

        intent_ids = [l.planting_intent_id for l in links]
        intents = {}
        if intent_ids:
            for pi in db.query(PlantingIntent).filter(
                PlantingIntent.planting_intent_id.in_(intent_ids)
            ).all():
                intents[pi.planting_intent_id] = pi

        for rid, links_for_report in link_by_report.items():
            intent_list = []
            for link in links_for_report:
                pi = intents.get(link.planting_intent_id)
                if pi:
                    intent_list.append({
                        "planting_intent_id": pi.planting_intent_id,
                        "volume": pi.volume,
                        "harvest_date": pi.harvest_date,
                    })
            intents_map[rid] = intent_list

    result = []
    for submission, report, user in reports:
        intents_for_report = intents_map.get(report.report_id, [])
        harvest_date = intents_for_report[0].get("harvest_date") if intents_for_report else None

        result.append({
            "submission_id": submission.submission_id,
            "report_id": submission.report_id,
            "title": report.title or f"{report.commodity or 'Crop'} Harvest Report",
            "commodity": report.commodity,
            "planting_date": report.planting_date,
            "harvest_date": harvest_date,
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "encoded_by_name": f"{user.first_name} {user.last_name}" if user else None,
            "municipality": report.municipality,
            "status": submission.status,
            "submitted_at": submission.submitted_at,
            "revision_remarks": submission.revision_remarks,
            "revision_count": submission.revision_count,
            "intent_count": len(intents_for_report),
        })

    return result


# ============================================================
# GET REPORTS FOR PROVINCIAL VALIDATION
# ============================================================

@router.get("/for-provincial-validation")
def get_reports_for_provincial_validation(db: Session = Depends(get_db)):
    """
    Get reports awaiting provincial validation.
    Returns ONE row per report (deduplicated).
    """
    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(ReportSubmission.status == FOR_PROVINCIAL_VALIDATION)
        .order_by(ReportSubmission.submitted_at.desc())
        .distinct()
        .all()
    )

    report_ids = [s.report_id for s, r, u in reports]
    
    intent_count_map = {}
    harvest_date_map = {}
    
    if report_ids:
        links = (
            db.query(ReportPlantingIntent)
            .filter(ReportPlantingIntent.report_id.in_(report_ids))
            .all()
        )
        
        intent_ids = [l.planting_intent_id for l in links]
        
        intents = {}
        if intent_ids:
            for pi in db.query(PlantingIntent).filter(
                PlantingIntent.planting_intent_id.in_(intent_ids)
            ).all():
                intents[pi.planting_intent_id] = pi
        
        for link in links:
            # Count intents per report
            intent_count_map[link.report_id] = intent_count_map.get(link.report_id, 0) + 1
            
            # Get harvest date (first intent's harvest date)
            pi = intents.get(link.planting_intent_id)
            if pi and link.report_id not in harvest_date_map:
                harvest_date_map[link.report_id] = pi.harvest_date

    return [
        {
            "submission_id": submission.submission_id,
            "report_id": submission.report_id,
            "title": report.title,
            "commodity": report.commodity,
            "municipality": report.municipality,
            "planting_date": report.planting_date,
            "harvest_date": harvest_date_map.get(report.report_id),
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "encoded_by_name": f"{user.first_name} {user.last_name}" if user else None,
            "status": submission.status,
            "submitted_at": submission.submitted_at,
            "revision_remarks": submission.revision_remarks,
            "revision_count": submission.revision_count,
            "intent_count": intent_count_map.get(report.report_id, 0),  
        }
        for submission, report, user in reports
    ]


# ============================================================
# GET REPORTS FOR DA-RFO VALIDATION
# ============================================================

@router.get("/for-da-rfo-validation")
def get_reports_for_da_rfo_validation(db: Session = Depends(get_db)):
    """
    Get reports awaiting DA-RFO validation.
    Returns ONE row per report (deduplicated).
    """
    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(ReportSubmission.status == FOR_DA_RFO_VALIDATION)
        .order_by(ReportSubmission.submitted_at.desc())
        .distinct()
        .all()
    )

    report_ids = [s.report_id for s, r, u in reports]

    intent_count_map = {}
    harvest_date_map = {}

    if report_ids:
        links = (
            db.query(ReportPlantingIntent)
            .filter(ReportPlantingIntent.report_id.in_(report_ids))
            .all()
        )

        intent_ids = [l.planting_intent_id for l in links]

        intents = {}
        if intent_ids:
            for pi in db.query(PlantingIntent).filter(
                PlantingIntent.planting_intent_id.in_(intent_ids)
            ).all():
                intents[pi.planting_intent_id] = pi

        for link in links:
            intent_count_map[link.report_id] = intent_count_map.get(link.report_id, 0) + 1

            pi = intents.get(link.planting_intent_id)
            if pi and link.report_id not in harvest_date_map:
                harvest_date_map[link.report_id] = pi.harvest_date

    return [
        {
            "submission_id": submission.submission_id,
            "report_id": submission.report_id,
            "title": report.title,
            "commodity": report.commodity,
            "municipality": report.municipality,
            "planting_date": report.planting_date,
            "harvest_date": harvest_date_map.get(report.report_id),
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "encoded_by_name": f"{user.first_name} {user.last_name}" if user else None,
            "status": submission.status,
            "submitted_at": submission.submitted_at,
            "revision_remarks": submission.revision_remarks,
            "revision_count": submission.revision_count,
            "intent_count": intent_count_map.get(report.report_id, 0),
        }
        for submission, report, user in reports
    ]


# ============================================================
# BULK APPROVE
# ============================================================

@router.post("/bulk-approve")
def bulk_approve_reports(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report_ids = payload.get("report_ids", [])
    if not report_ids:
        raise HTTPException(status_code=400, detail="No report IDs provided.")

    approved = []
    failed = []

    # Municipal Coordinator
    if current_user.role == "Municipal Coordinator":
        for report_id in report_ids:
            submission = db.query(ReportSubmission).filter(ReportSubmission.report_id == report_id).first()

            if not submission:
                failed.append({"report_id": report_id, "reason": "Submission not found."})
                continue

            if submission.status != SUBMITTED_MUNICIPAL_PENDING:
                failed.append({"report_id": report_id, "reason": f"Status is '{submission.status}'."})
                continue

            report = db.query(RawPlantReport).filter(RawPlantReport.report_id == report_id).first()
            if not report:
                failed.append({"report_id": report_id, "reason": "Report not found."})
                continue

            if report.municipality != current_user.municipality:
                failed.append({"report_id": report_id, "reason": "Not your municipality."})
                continue

            submission.status = SUBMITTED_PROVINCIAL_PENDING
            submission.current_validator_id = None
            submission.current_validator_role = "provincial_coordinator"

            history = ReportValidationHistory(
                submission_id=submission.submission_id,
                action="APPROVED",
                performed_by=current_user.user_id,
                role="municipal_coordinator",
                remarks="Bulk approved and forwarded to Provincial.",
            )
            db.add(history)
            approved.append(report_id)

        db.commit()
        return {
            "message": f"{len(approved)} report(s) approved and forwarded to Provincial.",
            "approved": approved,
            "failed": failed,
            "approved_count": len(approved),
            "failed_count": len(failed),
        }

    # Provincial Coordinator
    elif current_user.role in ("Provincial Coordinator", "Provincial"):
        for report_id in report_ids:
            submission = db.query(ReportSubmission).filter(ReportSubmission.report_id == report_id).first()

            if not submission:
                failed.append({"report_id": report_id, "reason": "Submission not found."})
                continue

            if submission.status != SUBMITTED_PROVINCIAL_PENDING:
                failed.append({"report_id": report_id, "reason": f"Status is '{submission.status}'."})
                continue

            submission.status = SUBMITTED_REGIONAL_PENDING
            submission.current_validator_id = None
            submission.current_validator_role = "darfo"
            submission.submitted_at = datetime.utcnow()

            history = ReportValidationHistory(
                submission_id=submission.submission_id,
                action="APPROVED",
                performed_by=current_user.user_id,
                role="provincial_coordinator",
                remarks="Bulk approved and forwarded to Regional.",
            )
            db.add(history)
            approved.append(report_id)

        db.commit()
        return {
            "message": f"{len(approved)} report(s) approved and forwarded to Regional.",
            "approved": approved,
            "failed": failed,
            "approved_count": len(approved),
            "failed_count": len(failed),
        }

    # DA-RFO Officer
    elif current_user.role in ("DA-RFO Officer", "Regional Coordinator", "DA-RFO"):
        for report_id in report_ids:
            submission = db.query(ReportSubmission).filter(ReportSubmission.report_id == report_id).first()

            if not submission:
                failed.append({"report_id": report_id, "reason": "Submission not found."})
                continue

            if submission.status != SUBMITTED_REGIONAL_PENDING:
                failed.append({"report_id": report_id, "reason": f"Status is '{submission.status}'."})
                continue

            submission.status = SUBMITTED_REGIONAL_APPROVED
            submission.current_validator_id = None
            submission.current_validator_role = None
            submission.approved_at = datetime.utcnow()
            submission.submitted_at = datetime.utcnow()

            history = ReportValidationHistory(
                submission_id=submission.submission_id,
                action="APPROVED",
                performed_by=current_user.user_id,
                role="darfo",
                remarks="Bulk approved by DA-RFO (final).",
            )
            db.add(history)
            approved.append(report_id)

        db.commit()
        return {
            "message": f"{len(approved)} report(s) approved (final).",
            "approved": approved,
            "failed": failed,
            "approved_count": len(approved),
            "failed_count": len(failed),
        }

    else:
        raise HTTPException(
            status_code=403,
            detail=f"Bulk approve is not allowed for role '{current_user.role}'."
        )


# ============================================================
# GET REPORTS SENT TO PROVINCIAL
# ============================================================

@router.get("/sent-to-provincial")
def get_sent_to_provincial(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "Municipal Coordinator":
        raise HTTPException(status_code=403, detail="Unauthorized.")

    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(
            RawPlantReport.municipality == current_user.municipality,
            ReportSubmission.status.in_([
                SUBMITTED_PROVINCIAL_PENDING,
                SUBMITTED_PROVINCIAL_FLAGGED,
                SUBMITTED_REGIONAL_PENDING,
                SUBMITTED_REGIONAL_FLAGGED,
                SUBMITTED_REGIONAL_APPROVED,
            ]),
        )
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    return [
        {
            "submission_id": s.submission_id,
            "report_id": s.report_id,
            "title": r.title or f"{r.commodity or 'Crop'} Harvest Report",
            "commodity": r.commodity,
            "municipality": r.municipality,
            "planting_date": r.planting_date,
            "estimated_yield": r.estimated_yield,
            "encoded_by": r.encoded_by,
            "encoded_by_name": f"{u.first_name} {u.last_name}" if u else None,
            "status": s.status,
            "submitted_at": s.submitted_at,
            "approved_at": s.approved_at,
            "flagged_at": s.flagged_at,
            "revision_remarks": s.revision_remarks,
            "revision_count": s.revision_count,
        }
        for s, r, u in reports
    ]


# ============================================================
# AWAITING AEW REVISION
# ============================================================

@router.get("/awaiting-aew-revision")
def get_awaiting_aew_revision(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role_status_map = {
        "Municipal Coordinator": SUBMITTED_MUNICIPAL_FLAGGED,
        "Provincial Coordinator": SUBMITTED_PROVINCIAL_FLAGGED,
        "DA-RFO Officer": SUBMITTED_REGIONAL_FLAGGED,
        "Regional Coordinator": SUBMITTED_REGIONAL_FLAGGED,
        "Agricultural Extension Worker": [
            SUBMITTED_MUNICIPAL_FLAGGED,
            SUBMITTED_PROVINCIAL_FLAGGED,
            SUBMITTED_REGIONAL_FLAGGED,
        ],
        "AEW": [
            SUBMITTED_MUNICIPAL_FLAGGED,
            SUBMITTED_PROVINCIAL_FLAGGED,
            SUBMITTED_REGIONAL_FLAGGED,
        ],
    }

    allowed_status = role_status_map.get(current_user.role)
    if not allowed_status:
        raise HTTPException(status_code=403, detail="Unauthorized role.")

    query = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(
            ReportSubmission.status.in_(allowed_status)
            if isinstance(allowed_status, list)
            else ReportSubmission.status == allowed_status
        )
    )

    if current_user.role == "Municipal Coordinator":
        query = query.filter(
            func.lower(func.trim(RawPlantReport.municipality)) ==
            func.lower(func.trim(current_user.municipality))
        )
    elif current_user.role in ("Agricultural Extension Worker", "AEW"):
        query = query.filter(RawPlantReport.encoded_by == current_user.user_id)

    reports = query.order_by(ReportSubmission.submitted_at.desc()).all()

    return [
        {
            "submission_id": s.submission_id,
            "report_id": s.report_id,
            "title": r.title or f"{r.commodity or 'Crop'} Harvest Report",
            "commodity": r.commodity,
            "municipality": r.municipality,
            "planting_date": r.planting_date,
            "estimated_yield": r.estimated_yield,
            "encoded_by": r.encoded_by,
            "encoded_by_name": f"{u.first_name} {u.last_name}" if u else None,
            "status": s.status,
            "submitted_at": s.submitted_at,
            "approved_at": s.approved_at,
            "flagged_at": s.flagged_at,
            "revision_remarks": s.revision_remarks,
            "revision_count": s.revision_count,
        }
        for s, r, u in reports
    ]


# ============================================================
# RETURNED TO MUNICIPAL (Provincial-flagged)
# ============================================================

@router.get("/returned-to-municipal")
def get_returned_to_municipal(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("Provincial Coordinator", "Provincial"):
        raise HTTPException(status_code=403, detail="Unauthorized.")

    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(ReportSubmission.status == SUBMITTED_PROVINCIAL_FLAGGED)
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    return [
        {
            "submission_id": s.submission_id,
            "report_id": s.report_id,
            "title": r.title or f"{r.commodity or 'Crop'} Harvest Report",
            "commodity": r.commodity,
            "municipality": r.municipality,
            "planting_date": r.planting_date,
            "estimated_yield": r.estimated_yield,
            "encoded_by": r.encoded_by,
            "encoded_by_name": f"{u.first_name} {u.last_name}" if u else None,
            "status": s.status,
            "submitted_at": s.submitted_at,
            "approved_at": s.approved_at,
            "flagged_at": s.flagged_at,
            "revision_remarks": s.revision_remarks,
            "revision_count": s.revision_count,
        }
        for s, r, u in reports
    ]


# ============================================================
# SENT TO REGIONAL (Provincial view)
# ============================================================

@router.get("/sent-to-regional")
def get_sent_to_regional(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("Provincial Coordinator", "Provincial"):
        raise HTTPException(status_code=403, detail="Unauthorized.")

    PAMPANGA_MUNICIPALITIES = [
        "Angeles City", "Apalit", "Arayat", "Bacolor", "Candaba",
        "Floridablanca", "Guagua", "Lubao", "Mabalacat", "Macabebe",
        "Magalang", "Masantol", "Mexico", "Minalin", "Porac",
        "San Fernando", "San Luis", "San Simon", "Santa Ana",
        "Santa Rita", "Santo Tomas",
    ]

    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(
            ReportSubmission.status.in_([
                SUBMITTED_REGIONAL_PENDING,
                SUBMITTED_REGIONAL_FLAGGED,
                SUBMITTED_REGIONAL_APPROVED,
            ]),
            RawPlantReport.municipality.in_(PAMPANGA_MUNICIPALITIES),
        )
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    return [
        {
            "submission_id": s.submission_id,
            "report_id": s.report_id,
            "title": r.title or f"{r.commodity or 'Crop'} Harvest Report",
            "commodity": r.commodity,
            "municipality": r.municipality,
            "planting_date": r.planting_date,
            "estimated_yield": r.estimated_yield,
            "encoded_by": r.encoded_by,
            "encoded_by_name": f"{u.first_name} {u.last_name}" if u else None,
            "status": s.status,
            "submitted_at": s.submitted_at,
            "approved_at": s.approved_at,
            "flagged_at": s.flagged_at,
            "revision_remarks": s.revision_remarks,
            "revision_count": s.revision_count,
        }
        for s, r, u in reports
    ]


# ============================================================
# RETURNED TO PROVINCIAL (DA-RFO-flagged)
# ============================================================

@router.get("/returned-to-provincial")
def get_returned_to_provincial(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("DA-RFO Officer", "Regional Coordinator", "DA-RFO"):
        raise HTTPException(status_code=403, detail="Unauthorized.")

    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(ReportSubmission.status == SUBMITTED_REGIONAL_FLAGGED)
        .order_by(ReportSubmission.flagged_at.desc())
        .all()
    )

    return [
        {
            "submission_id": s.submission_id,
            "report_id": s.report_id,
            "title": r.title or f"{r.commodity or 'Crop'} Harvest Report",
            "commodity": r.commodity,
            "municipality": r.municipality,
            "planting_date": r.planting_date,
            "estimated_yield": r.estimated_yield,
            "encoded_by": r.encoded_by,
            "encoded_by_name": f"{u.first_name} {u.last_name}" if u else None,
            "status": s.status,
            "submitted_at": s.submitted_at,
            "approved_at": s.approved_at,
            "flagged_at": s.flagged_at,
            "revision_remarks": s.revision_remarks,
            "revision_count": s.revision_count,
        }
        for s, r, u in reports
    ]


# ============================================================
# APPROVED BY REGIONAL (DA-RFO view)
# ============================================================

@router.get("/approved-by-regional")
def get_approved_by_regional(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("DA-RFO Officer", "Regional Coordinator", "DA-RFO"):
        raise HTTPException(status_code=403, detail="Unauthorized.")

    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(ReportSubmission.status == SUBMITTED_REGIONAL_APPROVED)
        .order_by(ReportSubmission.approved_at.desc())
        .all()
    )

    return [
        {
            "submission_id": s.submission_id,
            "report_id": s.report_id,
            "title": r.title or f"{r.commodity or 'Crop'} Harvest Report",
            "commodity": r.commodity,
            "municipality": r.municipality,
            "planting_date": r.planting_date,
            "estimated_yield": r.estimated_yield,
            "encoded_by": r.encoded_by,
            "encoded_by_name": f"{u.first_name} {u.last_name}" if u else None,
            "status": s.status,
            "submitted_at": s.submitted_at,
            "approved_at": s.approved_at,
            "flagged_at": s.flagged_at,
            "revision_remarks": s.revision_remarks,
            "revision_count": s.revision_count,
        }
        for s, r, u in reports
    ]


# ============================================================
# MUNICIPAL SUMMARY — AGGREGATED VIEW
# ============================================================

@router.get("/municipal-summary")
def get_municipal_summary(
    period_start: str | None = None,
    period_end: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Aggregate all reports in the municipal coordinator's municipality
    for the given period (defaults to last 7 days).
    """
    if current_user.role != "Municipal Coordinator":
        raise HTTPException(403, "Unauthorized.")

    if not current_user.municipality:
        raise HTTPException(400, "Municipal coordinator has no assigned municipality.")

    # --------------------------------------------------------
    # PERIOD
    # --------------------------------------------------------
    if period_end:
        try:
            period_end_dt = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
            if period_end_dt.tzinfo is not None:
                period_end_dt = period_end_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(400, "Invalid period_end format.")
    else:
        period_end_dt = datetime.utcnow()

    if period_start:
        try:
            period_start_dt = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
            if period_start_dt.tzinfo is not None:
                period_start_dt = period_start_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(400, "Invalid period_start format.")
    else:
        period_start_dt = period_end_dt - timedelta(days=7)

    # --------------------------------------------------------
    # GET ALL SUBMISSIONS IN PERIOD
    # --------------------------------------------------------
    submissions = (
        db.query(ReportSubmission, RawPlantReport)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .filter(
            RawPlantReport.municipality == current_user.municipality,
            ReportSubmission.submitted_at >= period_start_dt,
            ReportSubmission.submitted_at <= period_end_dt,
            ReportSubmission.status.in_([
                SUBMITTED_MUNICIPAL_PENDING,
                SUBMITTED_MUNICIPAL_FLAGGED,
                SUBMITTED_PROVINCIAL_PENDING,
                SUBMITTED_PROVINCIAL_FLAGGED,
                SUBMITTED_REGIONAL_PENDING,
                SUBMITTED_REGIONAL_FLAGGED,
                SUBMITTED_REGIONAL_APPROVED,
            ]),
        )
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    report_ids = [s.report_id for s, r in submissions]

    # ✅ Build report status map (used per-intent in intent_payload)
    report_status_map = {s.report_id: s.status for s, r in submissions}

    # ✅ Count reports still pending municipal validation
    pending_report_count = sum(
        1 for s, r in submissions
        if s.status == SUBMITTED_MUNICIPAL_PENDING
    )

    # --------------------------------------------------------
    # EMPTY STATE
    # --------------------------------------------------------
    if not report_ids:
        return {
            "municipality": current_user.municipality,
            "period_start": period_start_dt.isoformat() + "Z",
            "period_end": period_end_dt.isoformat() + "Z",
            "report_count": 0,
            "pending_report_count": 1,
            "intents": [],
        }

    # --------------------------------------------------------
    # GET ALL INTENTS ACROSS THOSE REPORTS
    # --------------------------------------------------------
    links = (
        db.query(ReportPlantingIntent)
        .filter(ReportPlantingIntent.report_id.in_(report_ids))
        .all()
    )

    intent_ids = [l.planting_intent_id for l in links]

    intents = (
        db.query(PlantingIntent)
        .filter(PlantingIntent.planting_intent_id.in_(intent_ids))
        .all()
    ) if intent_ids else []

    # --------------------------------------------------------
    # FARMERS
    # --------------------------------------------------------
    farmer_ids = list({i.farmer_id for i in intents if i.farmer_id})
    farmers = (
        db.query(Farmer)
        .filter(Farmer.farmer_id.in_(farmer_ids))
        .all()
    ) if farmer_ids else []

    farmer_map = {f.farmer_id: f for f in farmers}
    intent_map = {i.planting_intent_id: i for i in intents}

    # --------------------------------------------------------
    # BUILD INTENT PAYLOAD
    # --------------------------------------------------------
    intent_payload = []
    for link in links:
        pi = intent_map.get(link.planting_intent_id)
        if not pi:
            continue

        farmer = farmer_map.get(pi.farmer_id)

        intent_payload.append({
            "planting_intent_id": pi.planting_intent_id,
            "farmer_id": pi.farmer_id,
            "farmer_name": (
                f"{farmer.first_name} {farmer.last_name}"
                if farmer else "Unknown"
            ),
            "commodity": pi.commodity,
            "volume": pi.volume,
            "planting_date": pi.planting_date.isoformat() if pi.planting_date else None,
            "harvest_date": pi.harvest_date.isoformat() if pi.harvest_date else None,
            "actual_planting_date": (
                pi.actual_planting_date.isoformat()
                if getattr(pi, "actual_planting_date", None) else None
            ),
            "actual_harvest_date": (
                pi.actual_harvest_date.isoformat()
                if getattr(pi, "actual_harvest_date", None) else None
            ),
            "actual_harvest_volume": getattr(pi, "actual_harvest_volume", None),
            "finalized_status": link.finalized_status_snapshot or "NOT PLANTED",
            "barangay": farmer.barangay if farmer else None,
            "municipality": farmer.municipality if farmer else None,
            "status": link.plant_status_snapshot,
            # ✅ NEW: link back to report
            "report_id": link.report_id,
            "report_status": report_status_map.get(link.report_id),
        })

    return {
        "municipality": current_user.municipality,
        "period_start": period_start_dt.isoformat() + "Z",
        "period_end": period_end_dt.isoformat() + "Z",
        "report_count": len(report_ids),
        "pending_report_count": pending_report_count,
        "intents": intent_payload,
    }


# ============================================================
# PROVINCIAL SUMMARY — AGGREGATED VIEW (ALL MUNICIPALITIES)
# ============================================================

@router.get("/provincial-summary")
def get_provincial_summary(
    period_start: str | None = None,
    period_end: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Aggregate all reports across all Pampanga municipalities
    for the given period (defaults to last 7 days).

    Provincial Coordinator only. Returns all intents across
    all reports in the period, shaped the same way as a single
    report's intents so the frontend can reuse its renderer.
    """
    if current_user.role not in ("Provincial Coordinator", "Provincial"):
        raise HTTPException(403, "Unauthorized.")

    # --------------------------------------------------------
    # PERIOD
    # --------------------------------------------------------
    if period_end:
        try:
            period_end_dt = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
            if period_end_dt.tzinfo is not None:
                period_end_dt = period_end_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(400, "Invalid period_end format.")
    else:
        period_end_dt = datetime.utcnow()

    if period_start:
        try:
            period_start_dt = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
            if period_start_dt.tzinfo is not None:
                period_start_dt = period_start_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(400, "Invalid period_start format.")
    else:
        period_start_dt = period_end_dt - timedelta(days=7)

    # --------------------------------------------------------
    # PAMPANGA MUNICIPALITIES
    # --------------------------------------------------------
    PAMPANGA_MUNICIPALITIES = [
        "Angeles", "Angeles City",
        "Apalit", "Arayat", "Bacolor", "Candaba",
        "Floridablanca", "Guagua", "Lubao", "Mabalacat", "Macabebe",
        "Magalang", "Masantol", "Mexico", "Minalin", "Porac",
        "San Fernando", "San Luis", "San Simon", "Santa Ana",
        "Santa Rita", "Santo Tomas",
    ]

    # --------------------------------------------------------
    # GET ALL SUBMISSIONS IN PERIOD (ALL MUNICIPALITIES)
    # --------------------------------------------------------
    submissions = (
        db.query(ReportSubmission, RawPlantReport)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .filter(
            RawPlantReport.municipality.in_(PAMPANGA_MUNICIPALITIES),
            ReportSubmission.submitted_at >= period_start_dt,
            ReportSubmission.submitted_at <= period_end_dt,
            ReportSubmission.status.in_([
                SUBMITTED_MUNICIPAL_PENDING,
                SUBMITTED_MUNICIPAL_FLAGGED,
                SUBMITTED_PROVINCIAL_PENDING,
                SUBMITTED_PROVINCIAL_FLAGGED,
                SUBMITTED_REGIONAL_PENDING,
                SUBMITTED_REGIONAL_FLAGGED,
                SUBMITTED_REGIONAL_APPROVED,
            ]),
        )
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    report_ids = [s.report_id for s, r in submissions]

    # Build maps
    report_status_map = {s.report_id: s.status for s, r in submissions}
    report_municipality_map = {r.report_id: r.municipality for s, r in submissions}

    # Count reports still pending provincial validation
    pending_report_count = sum(
        1 for s, r in submissions
        if s.status == SUBMITTED_PROVINCIAL_PENDING
    )

    # --------------------------------------------------------
    # EMPTY STATE
    # --------------------------------------------------------
    if not report_ids:
        return {
            "scope": "Pampanga",
            "period_start": period_start_dt.isoformat() + "Z",
            "period_end": period_end_dt.isoformat() + "Z",
            "report_count": 0,
            "pending_report_count": 0,
            "municipality_count": 0,
            "intents": [],
        }

    # --------------------------------------------------------
    # GET ALL INTENTS ACROSS THOSE REPORTS
    # --------------------------------------------------------
    links = (
        db.query(ReportPlantingIntent)
        .filter(ReportPlantingIntent.report_id.in_(report_ids))
        .all()
    )

    intent_ids = [l.planting_intent_id for l in links]

    intents = (
        db.query(PlantingIntent)
        .filter(PlantingIntent.planting_intent_id.in_(intent_ids))
        .all()
    ) if intent_ids else []

    # --------------------------------------------------------
    # FARMERS
    # --------------------------------------------------------
    farmer_ids = list({i.farmer_id for i in intents if i.farmer_id})
    farmers = (
        db.query(Farmer)
        .filter(Farmer.farmer_id.in_(farmer_ids))
        .all()
    ) if farmer_ids else []

    farmer_map = {f.farmer_id: f for f in farmers}
    intent_map = {i.planting_intent_id: i for i in intents}

    # --------------------------------------------------------
    # BUILD INTENT PAYLOAD
    # --------------------------------------------------------
    intent_payload = []
    for link in links:
        pi = intent_map.get(link.planting_intent_id)
        if not pi:
            continue

        farmer = farmer_map.get(pi.farmer_id)

        intent_payload.append({
            "planting_intent_id": pi.planting_intent_id,
            "farmer_id": pi.farmer_id,
            "farmer_name": (
                f"{farmer.first_name} {farmer.last_name}"
                if farmer else "Unknown"
            ),
            "commodity": pi.commodity,
            "volume": pi.volume,
            "planting_date": pi.planting_date.isoformat() if pi.planting_date else None,
            "harvest_date": pi.harvest_date.isoformat() if pi.harvest_date else None,
            "actual_planting_date": (
                pi.actual_planting_date.isoformat()
                if getattr(pi, "actual_planting_date", None) else None
            ),
            "actual_harvest_date": (
                pi.actual_harvest_date.isoformat()
                if getattr(pi, "actual_harvest_date", None) else None
            ),
            "actual_harvest_volume": getattr(pi, "actual_harvest_volume", None),
            "finalized_status": link.finalized_status_snapshot or "NOT PLANTED",
            "barangay": farmer.barangay if farmer else None,
            "municipality": report_municipality_map.get(link.report_id),
            "status": link.plant_status_snapshot,
            "report_id": link.report_id,
            "report_status": report_status_map.get(link.report_id),
        })

    # Count unique municipalities
    municipality_count = len(set(report_municipality_map.values()))

    return {
        "scope": "Pampanga",
        "period_start": period_start_dt.isoformat() + "Z",
        "period_end": period_end_dt.isoformat() + "Z",
        "report_count": len(report_ids),
        "pending_report_count": pending_report_count,
        "municipality_count": municipality_count,
        "intents": intent_payload,
    }


# ============================================================
# REGIONAL SUMMARY — AGGREGATED VIEW (ALL PAMPANGA)
# ============================================================

@router.get("/regional-summary")
def get_regional_summary(
    period_start: str | None = None,
    period_end: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Aggregate all reports across all Pampanga municipalities for DA-RFO.
    Includes ALL statuses (municipal, provincial, regional).
    """
    if current_user.role not in ("DA-RFO Officer", "Regional Coordinator", "DA-RFO"):
        raise HTTPException(403, "Unauthorized.")

    # PERIOD
    if period_end:
        try:
            period_end_dt = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
            if period_end_dt.tzinfo is not None:
                period_end_dt = period_end_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(400, "Invalid period_end format.")
    else:
        period_end_dt = datetime.utcnow()

    if period_start:
        try:
            period_start_dt = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
            if period_start_dt.tzinfo is not None:
                period_start_dt = period_start_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(400, "Invalid period_start format.")
    else:
        period_start_dt = period_end_dt - timedelta(days=7)

    PAMPANGA_MUNICIPALITIES = [
        "Angeles", "Angeles City",
        "Apalit", "Arayat", "Bacolor", "Candaba",
        "Floridablanca", "Guagua", "Lubao", "Mabalacat", "Macabebe",
        "Magalang", "Masantol", "Mexico", "Minalin", "Porac",
        "San Fernando", "San Luis", "San Simon", "Santa Ana",
        "Santa Rita", "Santo Tomas",
    ]

    # ✅ ALL STATUSES
    submissions = (
        db.query(ReportSubmission, RawPlantReport)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .filter(
            RawPlantReport.municipality.in_(PAMPANGA_MUNICIPALITIES),
            ReportSubmission.submitted_at >= period_start_dt,
            ReportSubmission.submitted_at <= period_end_dt,
            ReportSubmission.status.in_([
                SUBMITTED_MUNICIPAL_PENDING,
                SUBMITTED_MUNICIPAL_FLAGGED,
                SUBMITTED_PROVINCIAL_PENDING,
                SUBMITTED_PROVINCIAL_FLAGGED,
                SUBMITTED_REGIONAL_PENDING,
                SUBMITTED_REGIONAL_FLAGGED,
                SUBMITTED_REGIONAL_APPROVED,
            ]),
        )
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    report_ids = [s.report_id for s, r in submissions]
    report_status_map = {s.report_id: s.status for s, r in submissions}
    report_municipality_map = {r.report_id: r.municipality for s, r in submissions}

    # Count pending DA-RFO
    pending_report_count = sum(
        1 for s, r in submissions
        if s.status == SUBMITTED_REGIONAL_PENDING
    )

    # --------------------------------------------------------
    # EMPTY STATE
    # --------------------------------------------------------
    if not report_ids:
        return {
            "scope": "Pampanga",
            "period_start": period_start_dt.isoformat() + "Z",
            "period_end": period_end_dt.isoformat() + "Z",
            "report_count": 0,
            "pending_report_count": 0,
            "municipality_count": 0,
            "intents": [],
        }

    links = (
        db.query(ReportPlantingIntent)
        .filter(ReportPlantingIntent.report_id.in_(report_ids))
        .all()
    )

    intent_ids = [l.planting_intent_id for l in links]

    intents = (
        db.query(PlantingIntent)
        .filter(PlantingIntent.planting_intent_id.in_(intent_ids))
        .all()
    ) if intent_ids else []

    farmer_ids = list({i.farmer_id for i in intents if i.farmer_id})
    farmers = (
        db.query(Farmer)
        .filter(Farmer.farmer_id.in_(farmer_ids))
        .all()
    ) if farmer_ids else []

    farmer_map = {f.farmer_id: f for f in farmers}
    intent_map = {i.planting_intent_id: i for i in intents}

    intent_payload = []
    for link in links:
        pi = intent_map.get(link.planting_intent_id)
        if not pi:
            continue
        farmer = farmer_map.get(pi.farmer_id)
        intent_payload.append({
            "planting_intent_id": pi.planting_intent_id,
            "farmer_id": pi.farmer_id,
            "farmer_name": (
                f"{farmer.first_name} {farmer.last_name}"
                if farmer else "Unknown"
            ),
            "commodity": pi.commodity,
            "volume": pi.volume,
            "planting_date": pi.planting_date.isoformat() if pi.planting_date else None,
            "harvest_date": pi.harvest_date.isoformat() if pi.harvest_date else None,
            "actual_planting_date": (
                pi.actual_planting_date.isoformat()
                if getattr(pi, "actual_planting_date", None) else None
            ),
            "actual_harvest_date": (
                pi.actual_harvest_date.isoformat()
                if getattr(pi, "actual_harvest_date", None) else None
            ),
            "actual_harvest_volume": getattr(pi, "actual_harvest_volume", None),
            "finalized_status": link.finalized_status_snapshot or "NOT PLANTED",
            "barangay": farmer.barangay if farmer else None,
            "municipality": report_municipality_map.get(link.report_id),
            "status": link.plant_status_snapshot,
            "report_id": link.report_id,
            "report_status": report_status_map.get(link.report_id),
        })

    municipality_count = len(set(report_municipality_map.values()))

    return {
        "scope": "Pampanga",
        "period_start": period_start_dt.isoformat() + "Z",
        "period_end": period_end_dt.isoformat() + "Z",
        "report_count": len(report_ids),
        "pending_report_count": pending_report_count,
        "municipality_count": municipality_count,
        "intents": intent_payload,
    }



# ============================================================
# ALL REGIONAL REPORTS (DA-RFO view — all statuses)
# ============================================================

@router.get("/all-regional-reports")
def get_all_regional_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get ALL reports in Pampanga (regardless of status) for DA-RFO monitoring.
    Returns one row per report (deduplicated).
    """
    if current_user.role not in ("DA-RFO Officer", "Regional Coordinator", "DA-RFO"):
        raise HTTPException(403, "Unauthorized.")

    PAMPANGA_MUNICIPALITIES = [
        "Angeles", "Angeles City",
        "Apalit", "Arayat", "Bacolor", "Candaba",
        "Floridablanca", "Guagua", "Lubao", "Mabalacat", "Macabebe",
        "Magalang", "Masantol", "Mexico", "Minalin", "Porac",
        "San Fernando", "San Luis", "San Simon", "Santa Ana",
        "Santa Rita", "Santo Tomas",
    ]

    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(
            RawPlantReport.municipality.in_(PAMPANGA_MUNICIPALITIES),
            ReportSubmission.status.in_([
                SUBMITTED_MUNICIPAL_PENDING,
                SUBMITTED_MUNICIPAL_FLAGGED,
                SUBMITTED_PROVINCIAL_PENDING,
                SUBMITTED_PROVINCIAL_FLAGGED,
                SUBMITTED_REGIONAL_PENDING,
                SUBMITTED_REGIONAL_FLAGGED,
                SUBMITTED_REGIONAL_APPROVED,
            ]),
        )
        .order_by(ReportSubmission.submitted_at.desc())
        .distinct()
        .all()
    )

    report_ids = [s.report_id for s, r, u in reports]

    intent_count_map = {}
    harvest_date_map = {}

    if report_ids:
        links = (
            db.query(ReportPlantingIntent)
            .filter(ReportPlantingIntent.report_id.in_(report_ids))
            .all()
        )

        intent_ids = [l.planting_intent_id for l in links]

        intents = {}
        if intent_ids:
            for pi in db.query(PlantingIntent).filter(
                PlantingIntent.planting_intent_id.in_(intent_ids)
            ).all():
                intents[pi.planting_intent_id] = pi

        for link in links:
            intent_count_map[link.report_id] = intent_count_map.get(link.report_id, 0) + 1
            pi = intents.get(link.planting_intent_id)
            if pi and link.report_id not in harvest_date_map:
                harvest_date_map[link.report_id] = pi.harvest_date

    return [
        {
            "submission_id": submission.submission_id,
            "report_id": submission.report_id,
            "title": report.title,
            "commodity": report.commodity,
            "municipality": report.municipality,
            "planting_date": report.planting_date,
            "harvest_date": harvest_date_map.get(report.report_id),
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "encoded_by_name": f"{user.first_name} {user.last_name}" if user else None,
            "status": submission.status,
            "submitted_at": submission.submitted_at,
            "approved_at": submission.approved_at,
            "flagged_at": submission.flagged_at,
            "revision_remarks": submission.revision_remarks,
            "revision_count": submission.revision_count,
            "intent_count": intent_count_map.get(report.report_id, 0),
        }
        for submission, report, user in reports
    ]


# ============================================================
# GET REPORT SUBMISSION
# ============================================================

@router.get("/{report_id}")
def get_report_submission(report_id: int, db: Session = Depends(get_db)):
    submission = db.query(ReportSubmission).filter(ReportSubmission.report_id == report_id).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Report submission not found.")

    return {
        "submission_id": submission.submission_id,
        "report_id": submission.report_id,
        "status": submission.status,
        "current_validator_id": submission.current_validator_id,
        "current_validator_role": submission.current_validator_role,
        "revision_remarks": submission.revision_remarks,
        "revision_count": submission.revision_count,
        "submitted_at": submission.submitted_at,
        "approved_at": submission.approved_at,
    }