from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core.database import get_db

from src.models.buyer_status import BuyerStatus
from src.models.buyer_registry import BuyerRegistry
from src.models.buyers import Buyer

from src.api.schemas.buyer_status import (
    BuyerStatusCreate,
    BuyerStatusUpdate,
    BuyerStatusResponse,
)

from src.api.services.email_service import send_verified_buyer_email

router = APIRouter()


# ============================================================
# CREATE BUYER STATUS
# ============================================================

@router.post(
    "/",
    response_model=BuyerStatusResponse
)
def create_buyer_status(
    buyer_status: BuyerStatusCreate,
    db: Session = Depends(get_db)
):
    # Check if buyer registry exists
    registry = (
        db.query(BuyerRegistry)
        .filter(
            BuyerRegistry.buyer_registry_id
            == buyer_status.buyer_registry_id
        )
        .first()
    )

    if not registry:
        raise HTTPException(
            status_code=404,
            detail="Buyer registry not found"
        )

    # Check if status already exists
    existing_status = (
        db.query(BuyerStatus)
        .filter(
            BuyerStatus.buyer_registry_id
            == buyer_status.buyer_registry_id
        )
        .first()
    )

    if existing_status:
        raise HTTPException(
            status_code=400,
            detail="Buyer status already exists for this registry."
        )

    db_status = BuyerStatus(
        **buyer_status.model_dump()
    )

    db.add(db_status)
    db.commit()
    db.refresh(db_status)

    return db_status

# ============================================================
# GET PENDING BUYER APPLICATIONS
# ============================================================

@router.get("/pending")
def get_pending_buyers(
    db: Session = Depends(get_db)
):
    results = (
        db.query(BuyerStatus)
        .join(
            BuyerRegistry,
            BuyerStatus.buyer_registry_id
            == BuyerRegistry.buyer_registry_id
        )
        .filter(
            BuyerStatus.status == "Pending"
        )
        .order_by(
            BuyerStatus.buyer_status_id.desc()
        )
        .all()
    )

    return [
        {
            "buyer_status_id": status.buyer_status_id,
            "buyer_registry_id": status.buyer_registry_id,
            "status": status.status,
            "reviewed_at": status.reviewed_at,

            "organization":
                status.buyer_registry.organization,

            "contact_person":
                status.buyer_registry.contact_person,

            "phone_number":
                status.buyer_registry.phone_number,

            "email_address":
                status.buyer_registry.email_address,

            "address":
                status.buyer_registry.address,

            "message":
                status.buyer_registry.message,

            "document":
                status.buyer_registry.document,
        }
        for status in results
    ]


# ============================================================
# GET VERIFIED BUYERS
# ============================================================

@router.get("/verified")
def get_verified_buyers(
    db: Session = Depends(get_db)
):
    results = (
        db.query(BuyerStatus)
        .join(
            BuyerRegistry,
            BuyerStatus.buyer_registry_id
            == BuyerRegistry.buyer_registry_id
        )
        .filter(
            BuyerStatus.status == "Verified"
        )
        .order_by(
            BuyerStatus.reviewed_at.desc()
        )
        .all()
    )

    return [
        {
            "buyer_status_id": status.buyer_status_id,
            "buyer_registry_id": status.buyer_registry_id,
            "status": status.status,
            "reviewed_at": status.reviewed_at,

            "organization":
                status.buyer_registry.organization,

            "contact_person":
                status.buyer_registry.contact_person,

            "phone_number":
                status.buyer_registry.phone_number,

            "email_address":
                status.buyer_registry.email_address,

            "address":
                status.buyer_registry.address,

            "message":
                status.buyer_registry.message,

            "document":
                status.buyer_registry.document,
        }
        for status in results
    ]


# ============================================================
# GET REJECTED BUYERS
# ============================================================

@router.get("/rejected")
def get_rejected_buyers(
    db: Session = Depends(get_db)
):
    results = (
        db.query(BuyerStatus)
        .join(
            BuyerRegistry,
            BuyerStatus.buyer_registry_id
            == BuyerRegistry.buyer_registry_id
        )
        .filter(
            BuyerStatus.status == "Rejected"
        )
        .order_by(
            BuyerStatus.reviewed_at.desc()
        )
        .all()
    )

    return [
        {
            "buyer_status_id": status.buyer_status_id,
            "buyer_registry_id": status.buyer_registry_id,
            "status": status.status,
            "reviewed_at": status.reviewed_at,

            "organization":
                status.buyer_registry.organization,

            "contact_person":
                status.buyer_registry.contact_person,

            "phone_number":
                status.buyer_registry.phone_number,

            "email_address":
                status.buyer_registry.email_address,

            "address":
                status.buyer_registry.address,

            "message":
                status.buyer_registry.message,

            "document":
                status.buyer_registry.document,
        }
        for status in results
    ]
# ============================================================
# VERIFY BUYER
# DA USES THIS
# ============================================================

@router.put("/{buyer_status_id}/verify")
async def verify_buyer(
    buyer_status_id: int,
    db: Session = Depends(get_db)
):
    # --------------------------------------------------------
    # FIND BUYER STATUS
    # --------------------------------------------------------

    buyer_status = (
        db.query(BuyerStatus)
        .filter(
            BuyerStatus.buyer_status_id
            == buyer_status_id
        )
        .first()
    )

    if not buyer_status:
        raise HTTPException(
            status_code=404,
            detail="Buyer status not found"
        )

    # --------------------------------------------------------
    # ONLY PENDING CAN BE VERIFIED
    # --------------------------------------------------------

    if buyer_status.status != "Pending":
        raise HTTPException(
            status_code=400,
            detail=(
                "This buyer application has "
                "already been reviewed."
            )
        )

    # --------------------------------------------------------
    # GET REGISTRY INFORMATION
    # --------------------------------------------------------

    registry = buyer_status.buyer_registry

    if not registry:
        raise HTTPException(
            status_code=404,
            detail="Buyer registry not found"
        )

    # --------------------------------------------------------
    # CHECK IF BUYER ALREADY EXISTS
    # --------------------------------------------------------

    existing_buyer = (
        db.query(Buyer)
        .filter(
            Buyer.email_address
            == registry.email_address
        )
        .first()
    )

    if existing_buyer:
        raise HTTPException(
            status_code=400,
            detail=(
                "A buyer with this email "
                "already exists."
            )
        )

    # --------------------------------------------------------
    # UPDATE BUYER STATUS
    # --------------------------------------------------------

    buyer_status.status = "Verified"
    buyer_status.reviewed_at = datetime.utcnow()

    # --------------------------------------------------------
    # CREATE OFFICIAL BUYER
    # --------------------------------------------------------

    db_buyer = Buyer(
        buyer_name=registry.organization,
        location=registry.address,
        phone_number=registry.phone_number,
        email_address=registry.email_address
    )

    db.add(db_buyer)

    # --------------------------------------------------------
    # SAVE DATABASE
    # --------------------------------------------------------

    db.commit()

    db.refresh(buyer_status)
    db.refresh(db_buyer)

    # --------------------------------------------------------
    # SEND VERIFIED BUYER EMAIL
    # --------------------------------------------------------

    email_sent = False
    email_message_id = None

    try:

        email_message_id = await send_verified_buyer_email(
            buyer_email=registry.email_address,
            contact_person=registry.contact_person,
            organization=registry.organization
        )

        email_sent = True

        print(
            "VERIFIED BUYER EMAIL SENT:",
            email_message_id
        )

    except Exception as email_error:

        print(
            "VERIFIED BUYER EMAIL ERROR:",
            email_error
        )

    # --------------------------------------------------------
    # RETURN SUCCESS
    # --------------------------------------------------------

    return {
        "message":
            "Buyer verified successfully.",

        "buyer_status_id":
            buyer_status.buyer_status_id,

        "buyer_registry_id":
            buyer_status.buyer_registry_id,

        "buyer_id":
            db_buyer.buyer_id,

        "status":
            buyer_status.status,

        "email":
            registry.email_address,

        "email_sent":
            email_sent,

        "email_message_id":
            email_message_id
    }

# ============================================================
# REJECT BUYER
# DA USES THIS
# ============================================================

@router.put("/{buyer_status_id}/reject")
def reject_buyer(
    buyer_status_id: int,
    db: Session = Depends(get_db)
):
    # Find status
    buyer_status = (
        db.query(BuyerStatus)
        .filter(
            BuyerStatus.buyer_status_id
            == buyer_status_id
        )
        .first()
    )

    if not buyer_status:
        raise HTTPException(
            status_code=404,
            detail="Buyer status not found"
        )

    # Only Pending can be rejected
    if buyer_status.status != "Pending":
        raise HTTPException(
            status_code=400,
            detail=(
                "This buyer application has "
                "already been reviewed."
            )
        )

    # Update status
    buyer_status.status = "Rejected"
    buyer_status.reviewed_at = datetime.utcnow()

    db.commit()

    db.refresh(buyer_status)

    return {
        "message": "Buyer application rejected.",
        "buyer_status_id":
            buyer_status.buyer_status_id,
        "buyer_registry_id":
            buyer_status.buyer_registry_id,
        "status":
            buyer_status.status
    }


# ============================================================
# GET BUYER STATUS BY ID
# IMPORTANT:
# THIS MUST BE AFTER /pending
# ============================================================

@router.get(
    "/{buyer_status_id}",
    response_model=BuyerStatusResponse
)
def read_buyer_status(
    buyer_status_id: int,
    db: Session = Depends(get_db)
):
    db_status = (
        db.query(BuyerStatus)
        .filter(
            BuyerStatus.buyer_status_id
            == buyer_status_id
        )
        .first()
    )

    if not db_status:
        raise HTTPException(
            status_code=404,
            detail="Buyer status not found"
        )

    return db_status


# ============================================================
# UPDATE BUYER STATUS
# ============================================================

@router.put(
    "/{buyer_status_id}",
    response_model=BuyerStatusResponse
)
def update_buyer_status(
    buyer_status_id: int,
    buyer_status: BuyerStatusUpdate,
    db: Session = Depends(get_db)
):
    db_status = (
        db.query(BuyerStatus)
        .filter(
            BuyerStatus.buyer_status_id
            == buyer_status_id
        )
        .first()
    )

    if not db_status:
        raise HTTPException(
            status_code=404,
            detail="Buyer status not found"
        )

    update_data = buyer_status.model_dump(
        exclude_unset=True
    )

    for key, value in update_data.items():
        setattr(db_status, key, value)

    db.commit()
    db.refresh(db_status)

    return db_status


# ============================================================
# DELETE BUYER STATUS
# ============================================================

@router.delete(
    "/{buyer_status_id}"
)
def delete_buyer_status(
    buyer_status_id: int,
    db: Session = Depends(get_db)
):
    db_status = (
        db.query(BuyerStatus)
        .filter(
            BuyerStatus.buyer_status_id
            == buyer_status_id
        )
        .first()
    )

    if not db_status:
        raise HTTPException(
            status_code=404,
            detail="Buyer status not found"
        )

    db.delete(db_status)
    db.commit()

    return {
        "message": "Buyer status deleted successfully."
    }