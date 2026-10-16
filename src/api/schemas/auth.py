# src/api/schemas/auth.py

from pydantic import BaseModel, EmailStr


# ============================================================
# LOGIN
# ============================================================

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    user_id: int
    username: str
    role: str


# ============================================================
# TOKEN DATA
# ============================================================

class TokenData(BaseModel):
    user_id: int
    username: str
    role: str


# ============================================================
# FORGOT PASSWORD
# ============================================================

class ForgotPasswordRequest(BaseModel):
    email_address: EmailStr


# ============================================================
# RESET PASSWORD
# ============================================================

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str