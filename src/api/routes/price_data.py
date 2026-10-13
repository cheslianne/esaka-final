from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.models.price_data import PriceData
from src.api.schemas.price_data import (
    PriceDataCreate,
    PriceDataUpdate,
    PriceDataResponse,
)

router = APIRouter()


@router.post("/", response_model=PriceDataResponse)
def create_price_data(
    price_data: PriceDataCreate,
    db: Session = Depends(get_db)
):
    db_price = PriceData(**price_data.model_dump())

    db.add(db_price)
    db.commit()
    db.refresh(db_price)

    return db_price


# GET ALL PRICE DATA
@router.get("/", response_model=list[PriceDataResponse])
def read_price_data(
    db: Session = Depends(get_db)
):
    prices = (
        db.query(PriceData)
        .order_by(PriceData.price_data_id.asc())
        .all()
    )

    return prices

@router.get("/{price_data_id}", response_model=PriceDataResponse)
def read_price_data(
    price_data_id: int,
    db: Session = Depends(get_db)
):
    db_price = (
        db.query(PriceData)
        .filter(PriceData.price_data_id == price_data_id)
        .first()
    )

    if not db_price:
        raise HTTPException(
            status_code=404,
            detail="Price data not found"
        )

    return db_price


@router.put("/{price_data_id}", response_model=PriceDataResponse)
def update_price_data(
    price_data_id: int,
    price_data: PriceDataUpdate,
    db: Session = Depends(get_db)
):
    db_price = (
        db.query(PriceData)
        .filter(PriceData.price_data_id == price_data_id)
        .first()
    )

    if not db_price:
        raise HTTPException(
            status_code=404,
            detail="Price data not found"
        )

    for key, value in price_data.model_dump(exclude_unset=True).items():
        setattr(db_price, key, value)

    db.commit()
    db.refresh(db_price)

    return db_price


@router.delete("/{price_data_id}")
def delete_price_data(
    price_data_id: int,
    db: Session = Depends(get_db)
):
    db_price = (
        db.query(PriceData)
        .filter(PriceData.price_data_id == price_data_id)
        .first()
    )

    if not db_price:
        raise HTTPException(
            status_code=404,
            detail="Price data not found"
        )

    db.delete(db_price)
    db.commit()

    return {
        "message": "Price data deleted successfully."
    }