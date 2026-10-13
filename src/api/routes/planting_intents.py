import asyncio
import json

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    File,
    UploadFile,
    Form,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from pydantic import BaseModel
import os
import uuid
from datetime import datetime

from src.core.config import settings
from src.core.database import SessionLocal, get_db
from src.core.auth import AUTH_COOKIE_NAME, decode_access_token, get_current_user

from src.models.planting_intents import PlantingIntent
from src.models.farmers import Farmer
from src.models.report_submission import ReportSubmission
from src.models.report_planting_intents import ReportPlantingIntent
from src.models.raw_plant_reports import RawPlantReport
from src.models.users import User
from src.models.alert_threshold_configs import AlertThresholdConfig

from src.api.schemas.planting_intents import (
    PlantingIntentCreate,
    PlantingIntentUpdate,
    PlantingIntentResponse,
)

router = APIRouter()

# ============================================================
# UPLOAD DIRECTORY CONFIGURATION
# ============================================================

UPLOAD_DIR = "uploads/planting_intent_attachments"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ============================================================
# HELPER - BUILD FRONTEND-FRIENDLY RESPONSE
# ============================================================

def build_planting_intent_response(planting_intent: PlantingIntent, farmer: Farmer, status: str):
    return {
        "planting_intent_id": planting_intent.planting_intent_id,
        "farmer_id": planting_intent.farmer_id,
        "farmer_name": f"{farmer.first_name} {farmer.last_name}",
        "location": farmer.address,
        "barangay": farmer.barangay,                   
        "municipality": farmer.municipality,        
        "commodity": planting_intent.commodity,
        "planting_date": planting_intent.planting_date,
        "harvest_date": planting_intent.harvest_date,
        "actual_planting_date": planting_intent.actual_planting_date,
        "actual_harvest_date": planting_intent.actual_harvest_date,
        "actual_harvest_volume": float(planting_intent.actual_harvest_volume) if planting_intent.actual_harvest_volume else None,
        "volume": planting_intent.volume,
        "remarks": planting_intent.remarks,
        "status": status,
        "finalized_status": planting_intent.finalized_status or "NOT PLANTED",  
        "created_at": planting_intent.created_at,
        "attachment_url": f"/api/planting-intents/{planting_intent.planting_intent_id}/attachment"
            if planting_intent.attachment_path else None,
        "notes": planting_intent.notes,
    }


# ============================================================
# GET PLANTING INTENTS WITH PAGINATION
# ============================================================

@router.get("/")
def get_planting_intents(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(10, ge=1, le=100, description="Items per page"),
    status: str | None = Query(None, description="Filter by status (Draft, Submitted, Locked)"),
    commodity: str | None = Query(None, description="Filter by commodity"),
    search: str | None = Query(None, description="Search by farmer name"),
    farmer_id: int | None = Query(None, ge=1, description="Filter by farmer"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get planting intents with pagination.
    Only shows intents for farmers under the current AEW.
    """
    
    # Base query - only show intents for farmers under this AEW
    query = (
        db.query(PlantingIntent)
        .join(Farmer, PlantingIntent.farmer_id == Farmer.farmer_id)
        .filter(Farmer.aew_id == current_user.user_id)
    )
    
    # Apply filters
    if status:
        query = query.filter(PlantingIntent.status == status)
    
    if commodity:
        query = query.filter(PlantingIntent.commodity.ilike(f"%{commodity}%"))
    
    if search:
        query = query.filter(
            (Farmer.first_name.ilike(f"%{search}%")) |
            (Farmer.last_name.ilike(f"%{search}%"))
        )

    if farmer_id is not None:
        query = query.filter(PlantingIntent.farmer_id == farmer_id)
    
    # Get total count for pagination
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * per_page
    intents = (
        query
        .order_by(desc(PlantingIntent.created_at))
        .offset(offset)
        .limit(per_page)
        .all()
    )
    
    # Build response
    result = []
    for intent in intents:
        farmer = db.query(Farmer).filter(Farmer.farmer_id == intent.farmer_id).first()
        if farmer:
            result.append({
            "planting_intent_id": intent.planting_intent_id,
            "farmer_id": intent.farmer_id,
            "farmer_name": f"{farmer.first_name} {farmer.last_name}",
            "commodity": intent.commodity,
            "volume": intent.volume,
            "location": f"{farmer.barangay}, {farmer.municipality}",
            "barangay": farmer.barangay,
            "municipality": farmer.municipality,
            "planting_date": intent.planting_date,
            "harvest_date": intent.harvest_date,
            "actual_planting_date": intent.actual_planting_date, 
            "actual_harvest_date": intent.actual_harvest_date,   
            "actual_harvest_volume": float(intent.actual_harvest_volume) if intent.actual_harvest_volume else None,
            "status": intent.status or "Draft",
            "finalized_status": intent.finalized_status or "NOT PLANTED",
            "is_in_report": intent.is_in_report or False,
            "created_at": intent.created_at,
            "remarks": intent.remarks,
        })

    
    return {
        "data": result,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": (total + per_page - 1) // per_page if total > 0 else 1,
            "has_next": page < ((total + per_page - 1) // per_page) if total > 0 else False,
            "has_prev": page > 1,
        }
    }


# ============================================================
# GET INTENT COUNTS
# ============================================================

@router.get("/counts")
def get_intent_counts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get counts of draft, submitted, and total intents for the current AEW.
    """
    
    draft_count = (
        db.query(PlantingIntent)
        .join(Farmer, PlantingIntent.farmer_id == Farmer.farmer_id)
        .filter(Farmer.aew_id == current_user.user_id)
        .filter(PlantingIntent.status == "Draft")
        .count()
    )
    
    submitted_count = (
        db.query(PlantingIntent)
        .join(Farmer, PlantingIntent.farmer_id == Farmer.farmer_id)
        .filter(Farmer.aew_id == current_user.user_id)
        .filter(PlantingIntent.status == "Submitted")
        .count()
    )
    
    # Locked/Used in report
    locked_count = (
        db.query(PlantingIntent)
        .join(Farmer, PlantingIntent.farmer_id == Farmer.farmer_id)
        .filter(Farmer.aew_id == current_user.user_id)
        .filter(PlantingIntent.status == "Locked")
        .count()
    )
    
    total_count = draft_count + submitted_count + locked_count
    
    return {
        "draft": draft_count,
        "submitted": submitted_count,
        "locked": locked_count,
        "total": total_count,
    }


# ============================================================
# CREATE PLANTING INTENT WITH ATTACHMENT
# ============================================================

@router.post("/with-attachment", response_model=PlantingIntentResponse)
async def create_planting_intent_with_attachment(
    farmer_id: int = Form(...),
    commodity: str = Form(...),
    volume: float = Form(...),
    planting_date: str = Form(...),
    harvest_date: str = Form(...),
    notes: str | None = Form(None),
    attachment: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a planting intent with optional file attachment.
    """
    
    # Check if farmer exists and belongs to this AEW
    farmer = db.query(Farmer).filter(
        Farmer.farmer_id == farmer_id,
        Farmer.aew_id == current_user.user_id
    ).first()
    
    if not farmer:
        raise HTTPException(
            status_code=404,
            detail="Farmer not found or not under your supervision"
        )
    
    # Handle attachment
    attachment_path = None
    
    if attachment:
        filename = attachment.filename or ""
        extension = os.path.splitext(filename)[1].lower()
        
        allowed_extensions = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".doc", ".docx", ".xls", ".xlsx"}
        
        if extension not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
            )
        
        file_content = await attachment.read()
        if len(file_content) > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="File size exceeds 5MB limit"
            )
        
        unique_filename = f"{uuid.uuid4()}{extension}"
        attachment_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(attachment_path, "wb") as file:
            file.write(file_content)
    
    # Parse dates
    try:
        planting_date_obj = datetime.strptime(planting_date, "%Y-%m-%d").date()
        harvest_date_obj = datetime.strptime(harvest_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Use YYYY-MM-DD"
        )
    
    # Create planting intent
    db_planting = PlantingIntent(
        farmer_id=farmer_id,
        commodity=commodity,
        volume=volume,
        planting_date=planting_date_obj,
        harvest_date=harvest_date_obj,
        notes=notes,
        attachment_path=attachment_path,
        status="Draft"
    )
    
    db.add(db_planting)
    db.commit()
    db.refresh(db_planting)
    
    return build_planting_intent_response(db_planting, farmer, "Draft")


# ============================================================
# CREATE PLANTING INTENT (Original - without attachment)
# ============================================================

@router.post("/", response_model=PlantingIntentResponse)
def create_planting_intent(
    planting_intent: PlantingIntentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if farmer exists and belongs to this AEW
    farmer = db.query(Farmer).filter(
        Farmer.farmer_id == planting_intent.farmer_id,
        Farmer.aew_id == current_user.user_id
    ).first()
    
    if not farmer:
        raise HTTPException(
            status_code=404,
            detail="Farmer not found or not under your supervision"
        )
    
    db_planting = PlantingIntent(
        **planting_intent.model_dump(),
        status="DRAFT"
    )
    
    db.add(db_planting)
    db.commit()
    db.refresh(db_planting)
    
    return build_planting_intent_response(db_planting, farmer, "DRAFT")

@router.get("/municipality-map")
def get_municipality_map_data(
    db: Session = Depends(get_db),
):
    """
    Municipality-level supply status for the DA-RFO map.
    """
    return _get_municipality_map_data(db)


def _get_municipality_map_data(db: Session):

    rows = (
        db.query(
            Farmer.municipality,
            PlantingIntent.commodity,
            func.sum(PlantingIntent.volume).label("total_supply"),
        )
        .join(
            PlantingIntent,
            PlantingIntent.farmer_id == Farmer.farmer_id,
        )
        .filter(
            PlantingIntent.status == "SUBMITTED",
            Farmer.municipality.isnot(None),
            Farmer.municipality != "",
        )
        .group_by(
            Farmer.municipality,
            PlantingIntent.commodity,
        )
        .all()
    )

    configs = (
        db.query(AlertThresholdConfig)
        .filter(AlertThresholdConfig.is_active.is_(True))
        .all()
    )

    config_map = {
        config.commodity.lower(): config
        for config in configs
    }

    municipality_data = {}

    for row in rows:
        municipality = row.municipality.strip()
        commodity = row.commodity.strip()
        total_supply = float(row.total_supply or 0)

        config = config_map.get(commodity.lower())

        if not config:
            continue

        base_demand = float(config.base_demand or 0)
        threshold_percent = float(
            config.oversupply_threshold or 100
        )

        alert_limit = (
            base_demand * threshold_percent / 100
        )

       
        if total_supply > alert_limit:
            status = "OVERSUPPLY"
        elif total_supply > base_demand:
            status = "SURPLUS"
        elif total_supply < base_demand:
            status = "DEFICIT"
        else:
            status = "BALANCE"

        if municipality not in municipality_data:
            municipality_data[municipality] = {
                "municipality": municipality,
                "commodities": [],
            }

        surplus_deficit = total_supply - base_demand
        capacity_pct = round((total_supply / base_demand) * 100, 1) if base_demand else None

        municipality_data[municipality]["commodities"].append({
            "commodity": commodity,
            "status": status,
            "estimated": True,
            "total_supply": total_supply,
            "base_demand": base_demand,
            "surplus_deficit": surplus_deficit,
            "capacity_pct": capacity_pct,
        })

    return {
        "data": list(municipality_data.values())
    }


def _get_authenticated_municipality_map(user_id: int, token: str):
    current_payload = decode_access_token(token)
    if not current_payload or current_payload.get("user_id") != user_id:
        return None

    with SessionLocal() as db:
        user = db.query(User).filter(User.user_id == user_id).first()
        if (
            not user
            or not user.is_active
            or user.is_archived
            or user.role not in ("Agricultural Extension Worker", "AEW")
        ):
            return None
        return _get_municipality_map_data(db)


@router.websocket("/municipality-map/ws")
async def municipality_map_updates(websocket: WebSocket):
    origin = websocket.headers.get("origin", "").rstrip("/")
    allowed_origins = {
        configured.strip().rstrip("/")
        for configured in settings.allowed_origins.split(",")
        if configured.strip()
    } | {"http://localhost:5500", "http://127.0.0.1:5500"}
    token = websocket.cookies.get(AUTH_COOKIE_NAME)
    payload = decode_access_token(token) if token else None

    if origin not in allowed_origins or not payload or payload.get("user_id") is None:
        await websocket.close(code=1008)
        return

    user_id = payload["user_id"]
    snapshot = await asyncio.to_thread(
        _get_authenticated_municipality_map,
        user_id,
        token,
    )
    if snapshot is None:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    previous_snapshot = None
    try:
        while True:
            serialized_snapshot = json.dumps(snapshot, default=str, sort_keys=True)
            if serialized_snapshot != previous_snapshot:
                await websocket.send_text(
                    json.dumps({"type": "municipality-map", **snapshot}, default=str)
                )
                previous_snapshot = serialized_snapshot

            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=15)
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                return

            snapshot = await asyncio.to_thread(
                _get_authenticated_municipality_map,
                user_id,
                token,
            )
            if snapshot is None:
                await websocket.close(code=1008)
                return
    except WebSocketDisconnect:
        return

# ============================================================
# GET ATTACHMENT
# ============================================================

from fastapi.responses import FileResponse

@router.get("/{planting_intent_id}/attachment")
def get_planting_intent_attachment(
    planting_intent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download the attachment for a planting intent.
    """
    
    planting_intent = (
        db.query(PlantingIntent)
        .filter(PlantingIntent.planting_intent_id == planting_intent_id)
        .first()
    )
    
    if not planting_intent:
        raise HTTPException(status_code=404, detail="Planting intent not found")
    
    # Check if this intent belongs to a farmer under this AEW
    farmer = db.query(Farmer).filter(
        Farmer.farmer_id == planting_intent.farmer_id,
        Farmer.aew_id == current_user.user_id
    ).first()
    
    if not farmer:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not planting_intent.attachment_path:
        raise HTTPException(status_code=404, detail="No attachment found")
    
    file_path = os.path.abspath(planting_intent.attachment_path)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Attachment file does not exist")
    
    # Determine media type
    extension = os.path.splitext(file_path)[1].lower()
    media_type = "application/octet-stream"
    
    if extension == ".pdf":
        media_type = "application/pdf"
    elif extension in [".jpg", ".jpeg"]:
        media_type = "image/jpeg"
    elif extension == ".png":
        media_type = "image/png"
    elif extension == ".gif":
        media_type = "image/gif"
    elif extension in [".doc", ".docx"]:
        media_type = "application/msword"
    elif extension == ".docx":
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=os.path.basename(file_path),
        content_disposition_type="inline"
    )


# ============================================================
# UPDATE PLANTING INTENT
# ============================================================

@router.put("/{planting_intent_id}", response_model=PlantingIntentResponse)
def update_planting_intent(
    planting_intent_id: int,
    planting_intent: PlantingIntentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_planting = (
        db.query(PlantingIntent)
        .join(Farmer, PlantingIntent.farmer_id == Farmer.farmer_id)
        .filter(
            PlantingIntent.planting_intent_id == planting_intent_id,
            Farmer.aew_id == current_user.user_id
        )
        .first()
    )
    
    if not db_planting:
        raise HTTPException(status_code=404, detail="Planting intent not found")
    
    if db_planting.status != "DRAFT":
        raise HTTPException(
            status_code=400,
            detail="Cannot edit a planting intent that has already been submitted."
        )
    
    update_data = planting_intent.model_dump(exclude_unset=True)
    
    # Don't allow status update through this endpoint
    if "status" in update_data:
        del update_data["status"]
    
    if "farmer_id" in update_data:
        farmer = db.query(Farmer).filter(
            Farmer.farmer_id == update_data["farmer_id"],
            Farmer.aew_id == current_user.user_id
        ).first()
        if not farmer:
            raise HTTPException(status_code=404, detail="Farmer not found")
    
    for key, value in update_data.items():
        setattr(db_planting, key, value)
    
    db.commit()
    db.refresh(db_planting)
    
    farmer = db.query(Farmer).filter(Farmer.farmer_id == db_planting.farmer_id).first()
    return build_planting_intent_response(
        db_planting,
        farmer,
        db_planting.status or "DRAFT"
    )

# ============================================================
# DELETE PLANTING INTENT
# ============================================================

@router.delete("/{planting_intent_id}")
def delete_planting_intent(
    planting_intent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_planting = (
        db.query(PlantingIntent)
        .join(Farmer, PlantingIntent.farmer_id == Farmer.farmer_id)
        .filter(
            PlantingIntent.planting_intent_id == planting_intent_id,
            Farmer.aew_id == current_user.user_id
        )
        .first()
    )
    
    if not db_planting:
        raise HTTPException(status_code=404, detail="Planting intent not found")
    
    if db_planting.status != "DRAFT":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a planting intent that has already been submitted."
        )
    
    # Delete the attachment file if it exists
    if db_planting.attachment_path:
        file_path = os.path.abspath(db_planting.attachment_path)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Warning: Could not delete attachment file: {e}")
    
    db.delete(db_planting)
    db.commit()
    
    return {"message": "Planting intent deleted successfully."}


# ============================================================
# SUBMIT PLANTING INTENT (Move from Draft to Submitted)
# ============================================================

@router.post("/{planting_intent_id}/submit")
def submit_planting_intent(
    planting_intent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submit a planting intent - moves from DRAFT to SUBMITTED status.
    Once submitted, it cannot be edited or deleted.
    """
    
    db_planting = (
        db.query(PlantingIntent)
        .join(Farmer, PlantingIntent.farmer_id == Farmer.farmer_id)
        .filter(
            PlantingIntent.planting_intent_id == planting_intent_id,
            Farmer.aew_id == current_user.user_id
        )
        .first()
    )
    
    if not db_planting:
        raise HTTPException(status_code=404, detail="Planting intent not found")
    
    if db_planting.status != "DRAFT":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit a planting intent with status: {db_planting.status}"
        )
    
    db_planting.status = "SUBMITTED"
    db.commit()
    db.refresh(db_planting)
    
    return {
        "message": "Planting intent submitted successfully",
        "planting_intent_id": db_planting.planting_intent_id,
        "status": db_planting.status
    }

@router.post("/{planting_intent_id}/pull")
def pull_planting_intent(
    planting_intent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Pull a planting intent back to DRAFT from SUBMITTED.
    """
    
    db_planting = (
        db.query(PlantingIntent)
        .join(Farmer, PlantingIntent.farmer_id == Farmer.farmer_id)
        .filter(
            PlantingIntent.planting_intent_id == planting_intent_id,
            Farmer.aew_id == current_user.user_id
        )
        .first()
    )
    
    if not db_planting:
        raise HTTPException(status_code=404, detail="Planting intent not found")
    
    if db_planting.status != "SUBMITTED":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot pull a planting intent with status: {db_planting.status}"
        )
    
    db_planting.status = "DRAFT"
    db.commit()
    db.refresh(db_planting)
    
    return {
        "message": "Planting intent pulled back to DRAFT",
        "planting_intent_id": db_planting.planting_intent_id,
        "status": db_planting.status
    }


# Endpoint for Finalized Intents

from datetime import date
from pydantic import BaseModel, validator

class FinalizedStatusUpdate(BaseModel):
    finalized_status: str
    actual_planting_date: date | None = None
    actual_harvest_date: date | None = None
    actual_harvest_volume: float | None = None  # ✅ ADD THIS


@router.patch("/{planting_intent_id}/finalized-status")
def update_finalized_status(
    planting_intent_id: int,
    payload: FinalizedStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """..."""
    ALLOWED = {"NOT PLANTED", "PLANTED", "HARVESTED", "MEDIATING"}
    new_status = payload.finalized_status.upper().strip()

    if new_status not in ALLOWED:
        raise HTTPException(status_code=400, detail="Invalid status.")

    db_planting = (
        db.query(PlantingIntent)
        .join(Farmer, PlantingIntent.farmer_id == Farmer.farmer_id)
        .filter(
            PlantingIntent.planting_intent_id == planting_intent_id,
            Farmer.aew_id == current_user.user_id
        )
        .first()
    )

    if not db_planting:
        raise HTTPException(status_code=404, detail="Planting intent not found")

    # Validation rules
    if new_status == "PLANTED":
        if not payload.actual_planting_date and not db_planting.actual_planting_date:
            raise HTTPException(
                status_code=400,
                detail="Actual planting date is required when marking as PLANTED."
            )
        if payload.actual_planting_date:
            db_planting.actual_planting_date = payload.actual_planting_date

    if new_status == "HARVESTED":
        # ✅ Require actual harvest date AND volume
        if not payload.actual_harvest_date and not db_planting.actual_harvest_date:
            raise HTTPException(
                status_code=400,
                detail="Actual harvest date is required when marking as HARVESTED."
            )
        if not payload.actual_harvest_volume and not db_planting.actual_harvest_volume:
            raise HTTPException(
                status_code=400,
                detail="Actual harvest volume is required when marking as HARVESTED."
            )
        if payload.actual_harvest_date:
            db_planting.actual_harvest_date = payload.actual_harvest_date
        if payload.actual_harvest_volume:
            db_planting.actual_harvest_volume = payload.actual_harvest_volume

    # Optional updates
    if payload.actual_planting_date and new_status != "PLANTED":
        db_planting.actual_planting_date = payload.actual_planting_date
    if payload.actual_harvest_date and new_status != "HARVESTED":
        db_planting.actual_harvest_date = payload.actual_harvest_date
    if payload.actual_harvest_volume and new_status != "HARVESTED":
        db_planting.actual_harvest_volume = payload.actual_harvest_volume

    db_planting.finalized_status = new_status
    db.commit()
    db.refresh(db_planting)

    return {
        "message": "Finalized status updated successfully",
        "planting_intent_id": db_planting.planting_intent_id,
        "finalized_status": db_planting.finalized_status,
        "actual_planting_date": db_planting.actual_planting_date,
        "actual_harvest_date": db_planting.actual_harvest_date,
        "actual_harvest_volume": float(db_planting.actual_harvest_volume) if db_planting.actual_harvest_volume else None,
    }
