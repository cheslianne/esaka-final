from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
import unicodedata


def validate_person_name(value: str) -> str:
    value = unicodedata.normalize("NFC", value).strip()
    allowed_punctuation = {" ", "-", "'", "’", "."}
    expecting_letter = True
    for char in value:
        category = unicodedata.category(char)
        if category.startswith("L") or (category.startswith("M") and not expecting_letter):
            expecting_letter = False
        elif char in allowed_punctuation and not expecting_letter:
            expecting_letter = True
        else:
            raise ValueError("Use letters, spaces, apostrophes, hyphens, or periods only.")

    if not value or len(value) > 50 or expecting_letter:
        raise ValueError("Use letters, spaces, apostrophes, hyphens, or periods only.")
    return value


def format_person_name(value: str) -> str:
    return validate_person_name(value).title()


def validate_username(value: str) -> str:
    value = value.strip()
    if not value or len(value) > 50 or any(
        not (char.isalnum() or char in "._-") for char in value
    ):
        raise ValueError("Use letters, numbers, periods, underscores, or hyphens only.")
    return value


def validate_phone_number(value: str) -> str:
    if len(value) != 11 or not value.isascii() or not value.isdigit():
        raise ValueError("Phone number must contain exactly 11 digits.")
    return value


def validate_password(value: str) -> str:
    requirements = (
        (len(value) >= 8, "at least 8 characters"),
        (len(value) <= 32, "no more than 32 characters"),
        (any(char.isupper() for char in value), "one uppercase letter"),
        (any(char.islower() for char in value), "one lowercase letter"),
        (any(char.isdigit() for char in value), "one number"),
        (any(not char.isalnum() for char in value), "one special character"),
    )
    missing = [description for is_met, description in requirements if not is_met]
    if missing:
        raise ValueError("Password must contain " + ", ".join(missing) + ".")
    return value


class UserBase(BaseModel):
    first_name: str
    last_name: str
    username: str
    email_address: EmailStr
    phone_number: str
    role: str
    region: str | None = None
    province: str | None = None
    municipality: str | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def names_contain_supported_characters(cls, value: str) -> str:
        return format_person_name(value)

    @field_validator("username")
    @classmethod
    def username_contains_supported_characters(cls, value: str) -> str:
        return validate_username(value)

    @field_validator("phone_number")
    @classmethod
    def phone_number_is_numeric(cls, value: str) -> str:
        return validate_phone_number(value)


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def password_meets_requirements(cls, value: str) -> str:
        return validate_password(value)


class UserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    email_address: EmailStr | None = None
    phone_number: str | None = None
    password: str | None = None
    role: str | None = None
    region: str | None = None
    province: str | None = None
    municipality: str | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def names_contain_supported_characters(cls, value: str | None) -> str | None:
        return format_person_name(value) if value is not None else None

    @field_validator("username")
    @classmethod
    def username_contains_supported_characters(cls, value: str | None) -> str | None:
        return validate_username(value) if value is not None else None

    @field_validator("phone_number")
    @classmethod
    def phone_number_is_numeric(cls, value: str | None) -> str | None:
        return validate_phone_number(value) if value is not None else None


class UserStatusUpdate(BaseModel):
    is_active: bool


# ============================================================
# ARCHIVE
# ============================================================

class UserArchiveUpdate(BaseModel):
    is_archived: bool
    remarks: str | None = None      # ✅ BAGO


class UserResponse(UserBase):
    user_id: int
    is_active: bool
    is_archived: bool          # ← idagdag
    archived_at: datetime | None = None   # ← idagdag
    archive_remarks: str | None = None      # ✅ BAGO
    archived_by: int | None = None
    archived_by_name: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True



class ForgotPasswordRequest(BaseModel):
    email_address: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str