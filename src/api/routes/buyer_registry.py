import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from src.core.database import get_db

from src.models.buyer_registry import BuyerRegistry
from src.models.buyer_status import BuyerStatus

from src.api.schemas.buyer_registry import (
    BuyerRegistryResponse,
    BuyerRegistryWithStatusResponse,
)


router = APIRouter()


# ============================================================
# UPLOAD CONFIGURATION
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[3]
UPLOAD_DIR = PROJECT_ROOT / "uploads" / "buyer_registry"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def resolve_document_path(document: str | os.PathLike[str]) -> Path:
    path = Path(document)
    return path if path.is_absolute() else PROJECT_ROOT / path

ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".pdf",
}

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "application/pdf",
}


# ============================================================
# CREATE BUYER REGISTRY
# ============================================================

@router.post(
    "/buyer-registry",
    response_model=BuyerRegistryResponse
)
async def create_buyer_registry(
    organization: str = Form(...),
    contact_person: str = Form(...),
    phone_number: str = Form(...),
    email_address: str = Form(...),
    address: str = Form(...),
    message: str | None = Form(None),
    document: UploadFile = File(...),
    db: Session = Depends(get_db),
):

    # ========================================================
    # VALIDATE FILE
    # ========================================================

    if not document.filename:
        raise HTTPException(
            status_code=400,
            detail="Document file is required."
        )

    original_filename = document.filename

    file_extension = os.path.splitext(
        original_filename
    )[1].lower()

    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only JPEG/JPG and PDF files are allowed."
        )

    if document.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only JPEG/JPG and PDF files are allowed."
        )

    # ========================================================
    # GENERATE UNIQUE FILE NAME
    # ========================================================

    unique_filename = (
        f"{uuid.uuid4().hex}{file_extension}"
    )

    file_path = UPLOAD_DIR / unique_filename

    # ========================================================
    # SAVE ACTUAL FILE
    # ========================================================

    try:

        file_content = await document.read()

        with open(file_path, "wb") as buffer:
            buffer.write(file_content)

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Failed to save uploaded document: {str(e)}"
        )

    # ========================================================
    # SAVE BUYER REGISTRY
    # ========================================================

    db_buyer = BuyerRegistry(
        organization=organization,
        contact_person=contact_person,
        phone_number=phone_number,
        email_address=email_address,
        address=address,
        message=message,

        # Save path/reference to the actual uploaded file
        document=str(file_path.relative_to(PROJECT_ROOT)),
    )

    try:

        db.add(db_buyer)

        db.flush()

        # ====================================================
        # CREATE DEFAULT BUYER STATUS
        # ====================================================

        db_status = BuyerStatus(
            buyer_registry_id=db_buyer.buyer_registry_id,
            status="Pending"
        )

        db.add(db_status)

        db.commit()

        db.refresh(db_buyer)

    except Exception as e:

        db.rollback()

        # Delete uploaded file if database save fails
        if os.path.exists(file_path):
            os.remove(file_path)

        raise HTTPException(
            status_code=500,
            detail=f"Failed to save buyer registry: {str(e)}"
        )

    return db_buyer


# ============================================================
# GET ALL BUYER REGISTRIES WITH STATUS
# ============================================================

@router.get(
    "/buyer-registry",
    response_model=list[BuyerRegistryWithStatusResponse]
)
def get_all_buyer_registries(
    db: Session = Depends(get_db)
):

    results = (
        db.query(
            BuyerRegistry,
            BuyerStatus.status
        )
        .join(
            BuyerStatus,
            BuyerStatus.buyer_registry_id
            == BuyerRegistry.buyer_registry_id
        )
        .order_by(
            BuyerRegistry.buyer_registry_id.desc()
        )
        .all()
    )

    response = []

    for buyer, status in results:

        response.append(
            BuyerRegistryWithStatusResponse(
                buyer_registry_id=buyer.buyer_registry_id,
                organization=buyer.organization,
                contact_person=buyer.contact_person,
                phone_number=buyer.phone_number,
                email_address=buyer.email_address,
                address=buyer.address,
                message=buyer.message,
                document=buyer.document,
                status=status
            )
        )

    return response


# ============================================================
# GET SINGLE BUYER REGISTRY
# ============================================================

@router.get(
    "/buyer-registry/{buyer_registry_id}",
    response_model=BuyerRegistryResponse
)
def read_buyer_registry(
    buyer_registry_id: int,
    db: Session = Depends(get_db)
):

    db_buyer = (
        db.query(BuyerRegistry)
        .filter(
            BuyerRegistry.buyer_registry_id
            == buyer_registry_id
        )
        .first()
    )

    if not db_buyer:

        raise HTTPException(
            status_code=404,
            detail="Buyer registry not found"
        )

    return db_buyer
# ============================================================
# VIEW / DOWNLOAD BUYER REGISTRY ATTACHMENT
# ============================================================

@router.get(
    "/buyer-registry/{buyer_registry_id}/attachment"
)
def view_buyer_registry_attachment(
    buyer_registry_id: int,
    db: Session = Depends(get_db)
):

    db_buyer = (
        db.query(BuyerRegistry)
        .filter(
            BuyerRegistry.buyer_registry_id
            == buyer_registry_id
        )
        .first()
    )

    if not db_buyer:
        raise HTTPException(
            status_code=404,
            detail="Buyer registry not found."
        )

    if not db_buyer.document:
        raise HTTPException(
            status_code=404,
            detail="No attachment found for this buyer registry."
        )

    file_path = resolve_document_path(db_buyer.document)

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail="Attachment file does not exist on the server."
        )

    extension = os.path.splitext(file_path)[1].lower()

    media_type = "application/octet-stream"

    if extension == ".pdf":
        media_type = "application/pdf"

    elif extension in [".jpg", ".jpeg"]:
        media_type = "image/jpeg"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=os.path.basename(file_path),
        content_disposition_type="inline"
    )
# ============================================================
# UPDATE BUYER REGISTRY
# ============================================================

@router.put(
    "/buyer-registry/{buyer_registry_id}",
    response_model=BuyerRegistryResponse
)
async def update_buyer_registry(
    buyer_registry_id: int,
    organization: str | None = Form(None),
    contact_person: str | None = Form(None),
    phone_number: str | None = Form(None),
    email_address: str | None = Form(None),
    address: str | None = Form(None),
    message: str | None = Form(None),
    document: UploadFile | None = File(None),
    db: Session = Depends(get_db)
):

    db_buyer = (
        db.query(BuyerRegistry)
        .filter(
            BuyerRegistry.buyer_registry_id
            == buyer_registry_id
        )
        .first()
    )

    if not db_buyer:

        raise HTTPException(
            status_code=404,
            detail="Buyer registry not found"
        )

    if organization is not None:
        db_buyer.organization = organization

    if contact_person is not None:
        db_buyer.contact_person = contact_person

    if phone_number is not None:
        db_buyer.phone_number = phone_number

    if email_address is not None:
        db_buyer.email_address = email_address

    if address is not None:
        db_buyer.address = address

    if message is not None:
        db_buyer.message = message

    # ========================================================
    # REPLACE DOCUMENT IF NEW FILE WAS UPLOADED
    # ========================================================

    if document is not None:

        if not document.filename:
            raise HTTPException(
                status_code=400,
                detail="Invalid document."
            )

        file_extension = os.path.splitext(
            document.filename
        )[1].lower()

        if file_extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Only JPEG/JPG and PDF files are allowed."
            )

        if document.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Invalid file format."
            )

        unique_filename = (
            f"{uuid.uuid4().hex}{file_extension}"
        )

        new_file_path = UPLOAD_DIR / unique_filename

        file_content = await document.read()

        with open(new_file_path, "wb") as buffer:
            buffer.write(file_content)

        # Delete old file
        if (
            db_buyer.document
            and resolve_document_path(db_buyer.document).exists()
        ):
            resolve_document_path(db_buyer.document).unlink()

        db_buyer.document = str(new_file_path.relative_to(PROJECT_ROOT))

    db.commit()

    db.refresh(db_buyer)

    return db_buyer
# ============================================================
# DELETE BUYER REGISTRY
# ============================================================

@router.delete(
    "/buyer-registry/{buyer_registry_id}"
)
def delete_buyer_registry(
    buyer_registry_id: int,
    db: Session = Depends(get_db)
):

    db_buyer = (
        db.query(BuyerRegistry)
        .filter(
            BuyerRegistry.buyer_registry_id
            == buyer_registry_id
        )
        .first()
    )

    if not db_buyer:

        raise HTTPException(
            status_code=404,
            detail="Buyer registry not found"
        )

    # ========================================================
    # DELETE ACTUAL DOCUMENT
    # ========================================================

    if (
        db_buyer.document
        and resolve_document_path(db_buyer.document).exists()
    ):
        resolve_document_path(db_buyer.document).unlink()

    db.delete(db_buyer)

    db.commit()

    return {
        "message":
        "Buyer registry deleted successfully."
    }