from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.models.buyers import Buyer
from src.api.schemas.buyers import (
    BuyerCreate,
    BuyerUpdate,
    BuyerResponse
)

router = APIRouter()


# ============================================================
# CREATE BUYER
# ============================================================

@router.post(
    "/buyers",
    response_model=BuyerResponse
)
def create_buyer(
    buyer: BuyerCreate,
    db: Session = Depends(get_db)
):
    db_buyer = Buyer(
        **buyer.model_dump()
    )

    db.add(db_buyer)
    db.commit()
    db.refresh(db_buyer)

    return db_buyer


# ============================================================
# GET BUYER
# ============================================================

@router.get(
    "/buyers/{buyer_id}",
    response_model=BuyerResponse
)
def read_buyer(
    buyer_id: int,
    db: Session = Depends(get_db)
):
    db_buyer = (
        db.query(Buyer)
        .filter(
            Buyer.buyer_id == buyer_id
        )
        .first()
    )

    if not db_buyer:
        raise HTTPException(
            status_code=404,
            detail="Buyer not found"
        )

    return db_buyer


# ============================================================
# UPDATE BUYER
# ============================================================

@router.put(
    "/buyers/{buyer_id}",
    response_model=BuyerResponse
)
def update_buyer(
    buyer_id: int,
    buyer: BuyerUpdate,
    db: Session = Depends(get_db)
):
    db_buyer = (
        db.query(Buyer)
        .filter(
            Buyer.buyer_id == buyer_id
        )
        .first()
    )

    if not db_buyer:
        raise HTTPException(
            status_code=404,
            detail="Buyer not found"
        )

    update_data = buyer.model_dump(
        exclude_unset=True
    )

    for key, value in update_data.items():
        setattr(db_buyer, key, value)

    db.commit()
    db.refresh(db_buyer)

    return db_buyer


# ============================================================
# DELETE BUYER
# ============================================================

@router.delete(
    "/buyers/{buyer_id}"
)
def delete_buyer(
    buyer_id: int,
    db: Session = Depends(get_db)
):
    db_buyer = (
        db.query(Buyer)
        .filter(
            Buyer.buyer_id == buyer_id
        )
        .first()
    )

    if not db_buyer:
        raise HTTPException(
            status_code=404,
            detail="Buyer not found"
        )

    db.delete(db_buyer)
    db.commit()

    return {
        "detail": "Buyer deleted"
    }