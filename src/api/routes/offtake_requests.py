from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.offtake_requests import OfftakeRequest
from src.models.buyers import Buyer
from src.models.buyer_registry import BuyerRegistry
from src.models.buyer_status import BuyerStatus
from src.models.farmers import Farmer
from src.models.users import User
from src.api.services.email_service import send_offtake_request_email

from src.api.schemas.offtake_requests import (
    OfftakeRequestCreate,
    OfftakeRequestUpdate,
    OfftakeRequestResponse,
)


router = APIRouter()


def _owned_offtake_requests(db: Session, current_user: User):
    return (
        db.query(OfftakeRequest)
        .join(Farmer, OfftakeRequest.farmer_id == Farmer.farmer_id)
        .filter(Farmer.aew_id == current_user.user_id)
    )


# ============================================================
# CREATE OFFTAKE REQUEST
# ============================================================

@router.post("/", response_model=OfftakeRequestResponse)
async def create_offtake_request(
    request: OfftakeRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ========================================================
    # 1. CHECK IF FARMER EXISTS
    # ========================================================

    farmer = (
        db.query(Farmer)
        .filter(
            Farmer.farmer_id == request.farmer_id,
            Farmer.aew_id == current_user.user_id,
        )
        .first()
    )

    if not farmer:
        raise HTTPException(
            status_code=404,
            detail="Farmer not found"
        )

    # ========================================================
    # 2. CREATE OFFTAKE REQUEST
    # ========================================================

    db_request = OfftakeRequest(
        **request.model_dump()
    )

    # ========================================================
    # 3. SAVE TO DATABASE
    # ========================================================

    db.add(db_request)
    db.commit()
    db.refresh(db_request)

    # ========================================================
    # 4. GET ALL BUYERS WITH EMAIL
    # ========================================================

    buyers = (
        db.query(Buyer)
        .filter(Buyer.email_address.isnot(None))
        .all()
    )

    # Include verified registry buyers that have no row in `buyers`
    known_emails = {b.email_address.strip().lower() for b in buyers}
    verified_registry = (
        db.query(BuyerRegistry)
        .join(
            BuyerStatus,
            BuyerStatus.buyer_registry_id == BuyerRegistry.buyer_registry_id,
        )
        .filter(BuyerStatus.status == "Verified")
        .all()
    )
    recipients = [
        {"email": b.email_address, "name": b.buyer_name} for b in buyers
    ]
    for reg in verified_registry:
        email = (reg.email_address or "").strip()
        if email and email.lower() not in known_emails:
            known_emails.add(email.lower())
            recipients.append({"email": email, "name": reg.organization})

    # ========================================================
    # DEBUG
    # ========================================================

    print("========================================")
    print("OFFTAKE EMAIL DEBUG")
    print("Number of buyers with email:", len(buyers))

    for buyer in buyers:
        print(
            "Buyer:",
            buyer.buyer_name,
            "| Email:",
            buyer.email_address
        )

    print("========================================")

    # ========================================================
    # 5. SEND EMAIL NOTIFICATION
    # ========================================================

    farmer_full_name = " ".join(
        p for p in [
            farmer.first_name,
            farmer.middle_name,
            farmer.last_name,
        ] if p
    )

    for recipient in recipients:

        print(f">>> Sending offtake email to: {recipient['email']}")

        try:
            message_id = await send_offtake_request_email(
                buyer_email=recipient["email"],
                buyer_name=recipient["name"],
                commodity=db_request.commodity,
                quantity=db_request.quantity,
                selling_price=db_request.selling_price,
                harvest_date=db_request.harvest_date,
                farmer_location=farmer.address,
                farmer_name=farmer_full_name,
                rsbsa_id=farmer.rsbsa_id,
                delivery_location=db_request.delivery_location or "",
            )
        except Exception as e:
            print(
                f">>> OFFTAKE EMAIL FAILED to {recipient['email']}: "
                f"{type(e).__name__}: {e}"
            )
            continue

        if message_id:
            print(
                f">>> OFFTAKE EMAIL SENT to {recipient['email']} "
                f"(message_id: {message_id})"
            )
        else:
            print(f">>> OFFTAKE EMAIL NOT SENT to {recipient['email']} (see email error above)")
    # ========================================================
    # 6. RETURN CREATED REQUEST
    # ========================================================

    return db_request


# ============================================================
# GET ALL OFFTAKE REQUESTS
# ============================================================

@router.get(
    "/",
    response_model=list[OfftakeRequestResponse]
)
def get_offtake_requests(
    farmer_id: int | None = Query(None, ge=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    requests_query = _owned_offtake_requests(db, current_user)
    if farmer_id is not None:
        requests_query = requests_query.filter(OfftakeRequest.farmer_id == farmer_id)

    requests = (
        requests_query
        .order_by(
            OfftakeRequest.offtake_request_id.desc()
        )
        .all()
    )

    return requests


# ============================================================
# GET SINGLE OFFTAKE REQUEST
# ============================================================

@router.get(
    "/{offtake_request_id}",
    response_model=OfftakeRequestResponse
)
def read_offtake_request(
    offtake_request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    db_request = (
        _owned_offtake_requests(db, current_user)
        .filter(
            OfftakeRequest.offtake_request_id
            == offtake_request_id
        )
        .first()
    )

    if not db_request:
        raise HTTPException(
            status_code=404,
            detail="Offtake request not found"
        )

    return db_request


# ============================================================
# UPDATE OFFTAKE REQUEST
# ============================================================

@router.put(
    "/{offtake_request_id}",
    response_model=OfftakeRequestResponse
)
def update_offtake_request(
    offtake_request_id: int,
    request: OfftakeRequestUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    db_request = (
        _owned_offtake_requests(db, current_user)
        .filter(
            OfftakeRequest.offtake_request_id
            == offtake_request_id
        )
        .first()
    )

    if not db_request:
        raise HTTPException(
            status_code=404,
            detail="Offtake request not found"
        )

    update_data = request.model_dump(exclude_unset=True)
    if "farmer_id" in update_data:
        farmer = (
            db.query(Farmer)
            .filter(
                Farmer.farmer_id == update_data["farmer_id"],
                Farmer.aew_id == current_user.user_id,
            )
            .first()
        )
        if not farmer:
            raise HTTPException(status_code=404, detail="Farmer not found")

    for key, value in update_data.items():

        setattr(
            db_request,
            key,
            value
        )

    db.commit()
    db.refresh(db_request)

    return db_request


# ============================================================
# DELETE OFFTAKE REQUEST
# ============================================================

@router.delete("/{offtake_request_id}")
def delete_offtake_request(
    offtake_request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    db_request = (
        _owned_offtake_requests(db, current_user)
        .filter(
            OfftakeRequest.offtake_request_id
            == offtake_request_id
        )
        .first()
    )

    if not db_request:
        raise HTTPException(
            status_code=404,
            detail="Offtake request not found"
        )

    db.delete(db_request)
    db.commit()

    return {
        "message": "Offtake request deleted successfully."
    }