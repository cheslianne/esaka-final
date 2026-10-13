import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.models.farmers import Farmer
from src.models.planting_intents import PlantingIntent  # ✅ ADD THIS
from src.models.offtake_requests import OfftakeRequest  # ✅ ADD THIS
from src.api.schemas.farmers import (
    FarmerCreate,
    FarmerUpdate,
    FarmerResponse,
)

from src.core.auth import get_current_user
from src.models.users import User
from src.models.planting_intents import PlantingIntent
from src.models.offtake_requests import OfftakeRequest


router = APIRouter(
    prefix="/farmers",
    tags=["Farmers"]
)


def scoped_farmer_query(db: Session, current_user: User):
    """Return only farmers visible within the current user's assigned area."""
    query = db.query(Farmer)

    if is_aew_role(current_user.role):
        return query.filter(Farmer.aew_id == current_user.user_id)

    if current_user.role == "Municipal Coordinator":
        if not current_user.municipality:
            return query.filter(False)
        return query.filter(Farmer.municipality == current_user.municipality)

    if current_user.role in ("Provincial Coordinator", "Provincial"):
        if not current_user.province:
            return query.filter(False)
        municipalities = db.query(User.municipality).filter(
            User.role == "Municipal Coordinator",
            User.province == current_user.province,
            User.municipality.isnot(None),
        ).distinct().subquery()
        return query.filter(Farmer.municipality.in_(municipalities))

    if current_user.role in (
        "DA-RFO Officer",
        "Regional Coordinator",
        "DA-RFO",
    ):
        if not current_user.region:
            return query.filter(False)
        municipalities = db.query(User.municipality).filter(
            User.role == "Municipal Coordinator",
            User.region == current_user.region,
            User.municipality.isnot(None),
        ).distinct().subquery()
        return query.filter(Farmer.municipality.in_(municipalities))

    if current_user.role in ("System Administrator", "System Admin"):
        return query

    return query.filter(False)


def get_scoped_farmer(farmer_id: int, current_user: User, db: Session):
    return scoped_farmer_query(db, current_user).filter(
        Farmer.farmer_id == farmer_id
    ).first()


def is_aew_role(role: str | None) -> bool:
    normalized_role = " ".join((role or "").replace("_", " ").split()).lower()
    return normalized_role in {
        "aew",
        "agricultural extension worker",
    }




# ============================================================
# ADDRESS EXTRACTION
# ============================================================

def extract_location_from_address(address: str):
    """
    Extract barangay and municipality from an address.

    Examples:
        "Brgy Mabait, San Jose"
        -> barangay: Mabait
        -> municipality: San Jose

        "Brgy. Mabait, San Jose"
        -> barangay: Mabait
        -> municipality: San Jose

        "Barangay Mabait, San Jose"
        -> barangay: Mabait
        -> municipality: San Jose
    """

    if not address:
        return None, None

    # Clean extra spaces
    address = " ".join(address.strip().split())

    # Split address by comma
    parts = [part.strip() for part in address.split(",") if part.strip()]

    if len(parts) < 2:
        return None, None

    barangay = None
    municipality = None

    # --------------------------------------------------------
    # FIRST PART = BARANGAY
    # --------------------------------------------------------

    barangay_match = re.match(
        r"^(?:Brgy\.?|Barangay)\s+(.+)$",
        parts[0],
        re.IGNORECASE
    )

    if barangay_match:
        barangay = barangay_match.group(1).strip()

    # --------------------------------------------------------
    # SECOND PART = MUNICIPALITY
    # --------------------------------------------------------

    municipality = parts[1].strip()

    # Remove unnecessary suffixes
    municipality = re.sub(
        r"\s+City$",
        "",
        municipality,
        flags=re.IGNORECASE
    ).strip()

    return barangay, municipality


# ============================================================
# CREATE FARMER
# ============================================================

@router.post(
    "/",
    response_model=FarmerResponse,
    status_code=status.HTTP_201_CREATED
)
def create_farmer(
    farmer: FarmerCreate,
    current_user: User = Depends(get_current_user),  # ✅ Get logged-in user
    db: Session = Depends(get_db)
):
    # Only AEWs can register farmers
    if not is_aew_role(current_user.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Agricultural Extension Workers can register farmers."
        )
    
    # Check duplicate RSBSA ID
    existing_farmer = db.query(Farmer).filter(Farmer.rsbsa_id == farmer.rsbsa_id).first()
    if existing_farmer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="RSBSA ID already exists."
        )

    # Extract barangay + municipality from address
    extracted_barangay, extracted_municipality = extract_location_from_address(farmer.address)
    barangay = extracted_barangay or farmer.barangay
    municipality = extracted_municipality or farmer.municipality

    if not barangay:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to extract barangay from address."
        )
    if not municipality:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to extract municipality from address."
        )

    # CREATE FARMER WITH aew_id (auto-assigned to current AEW)
    new_farmer = Farmer(
        rsbsa_id=farmer.rsbsa_id,
        first_name=farmer.first_name,
        middle_name=farmer.middle_name,
        last_name=farmer.last_name,
        municipality=municipality,
        barangay=barangay,
        address=farmer.address,
        sex=farmer.sex,
        birthdate=farmer.birthdate,
        email_address=farmer.email_address,
        phone_number=farmer.phone_number,
        aew_id=current_user.user_id,
    )

    try:
        db.add(new_farmer)
        db.commit()
        db.refresh(new_farmer)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create farmer: {str(e)}"
        )

    return new_farmer


# ============================================================
# GET ALL FARMERS
# ============================================================

@router.get(
    "/",
    response_model=list[FarmerResponse]
)
def get_farmers(
    current_user: User = Depends(get_current_user),  # ✅ Get logged-in user
    db: Session = Depends(get_db)
):
    """Get farmers visible within the current user's assigned area."""

    query = scoped_farmer_query(db, current_user)
    
    farmers = query.order_by(Farmer.farmer_id.desc()).all()
    
    updated = False
    for farmer in farmers:
        if ((farmer.municipality is None or farmer.barangay is None) and farmer.address):
            extracted_barangay, extracted_municipality = extract_location_from_address(farmer.address)
            if farmer.barangay is None and extracted_barangay:
                farmer.barangay = extracted_barangay
                updated = True
            if farmer.municipality is None and extracted_municipality:
                farmer.municipality = extracted_municipality
                updated = True
    
    if updated:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update farmer location data: {str(e)}"
            )
    
    return farmers


# ============================================================
# GET SINGLE FARMER
# ============================================================

@router.get(
    "/{farmer_id}",
    response_model=FarmerResponse
)
def get_farmer(
    farmer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farmer = get_scoped_farmer(farmer_id, current_user, db)

    if not farmer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Farmer not found."
        )

    # Repair missing location data
    if (
        (farmer.municipality is None or farmer.barangay is None)
        and farmer.address
    ):
        extracted_barangay, extracted_municipality = (
            extract_location_from_address(farmer.address)
        )

        if farmer.barangay is None and extracted_barangay:
            farmer.barangay = extracted_barangay

        if farmer.municipality is None and extracted_municipality:
            farmer.municipality = extracted_municipality

        try:
            db.commit()
            db.refresh(farmer)

        except Exception as e:
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update farmer location data: {str(e)}"
            )

    return farmer


# ============================================================
# UPDATE FARMER
# ============================================================

@router.put(
    "/{farmer_id}",
    response_model=FarmerResponse
)
def update_farmer(
    farmer_id: int,
    farmer_data: FarmerUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farmer = get_scoped_farmer(farmer_id, current_user, db)

    if not farmer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Farmer not found."
        )

    # Check duplicate RSBSA ID
    if farmer_data.rsbsa_id is not None:
        existing_farmer = (
            db.query(Farmer)
            .filter(
                Farmer.rsbsa_id == farmer_data.rsbsa_id,
                Farmer.farmer_id != farmer_id
            )
            .first()
        )

        if existing_farmer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="RSBSA ID already exists."
            )

    # ========================================================
    # UPDATE FIELDS
    # ========================================================

    update_data = farmer_data.model_dump(
        exclude_unset=True
    )

    # ========================================================
    # IF ADDRESS IS UPDATED, EXTRACT LOCATION AGAIN
    # ========================================================

    if "address" in update_data and update_data["address"]:

        extracted_barangay, extracted_municipality = (
            extract_location_from_address(
                update_data["address"]
            )
        )

        if extracted_barangay:
            update_data["barangay"] = extracted_barangay

        if extracted_municipality:
            update_data["municipality"] = extracted_municipality

    # Apply updates
    for field, value in update_data.items():
        setattr(farmer, field, value)

    try:
        db.commit()
        db.refresh(farmer)

    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update farmer: {str(e)}"
        )

    return farmer


# ============================================================
# DELETE FARMER
# ============================================================

@router.delete("/{farmer_id}")
def delete_farmer(
    farmer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    farmer = get_scoped_farmer(farmer_id, current_user, db)
    
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")
    
    # ✅ CHECK FOR RELATED RECORDS
    planting_intents = db.query(PlantingIntent).filter(
        PlantingIntent.farmer_id == farmer_id
    ).count()
    
    offtake_requests = db.query(OfftakeRequest).filter(
        OfftakeRequest.farmer_id == farmer_id
    ).count()
    
    if planting_intents > 0 or offtake_requests > 0:
        error_message = (
            f"Cannot delete farmer '{farmer.first_name} {farmer.last_name}'.\n\n"
            f"This farmer has existing records in the system:\n"
            f"• Planting Intents: {planting_intents}\n"
            f"• Offtake Requests: {offtake_requests}\n\n"
            f"Please delete or reassign these records first before deleting the farmer."
        )
        raise HTTPException(
            status_code=400,
            detail=error_message
        )
    
    db.delete(farmer)
    db.commit()
    
    return {"detail": f"Farmer '{farmer.first_name} {farmer.last_name}' deleted successfully"}
