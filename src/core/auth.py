# src/core/auth.py

from datetime import datetime, timedelta, timezone

from fastapi import (
    Depends,
    HTTPException,
    status,
    Request,
)

from jose import jwt, JWTError
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.database import (
    get_db,
    current_user_id,
    current_ip_address,
    current_user_agent,
)

from src.models.users import User


SECRET_KEY = "esaka-secret-key-change-this-later"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 8 * 60

AUTH_COOKIE_NAME = "esaka_access_token"


def create_access_token(data: dict):
    to_encode = data.copy()

    expire = (
        datetime.now(timezone.utc)
        + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    to_encode.update({"exp": expire})

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        return payload

    except JWTError:
        return None


async def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:

    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin:
            allowed_origins = {
                configured.strip().rstrip("/")
                for configured in settings.allowed_origins.split(",")
                if configured.strip()
            } | {"http://localhost:5500", "http://127.0.0.1:5500"}
            if origin.rstrip("/") not in allowed_origins:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Untrusted request origin",
                )

    # Decode token
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user ID from token
    user_id: int = payload.get("user_id")

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Find user
    user = (
        db.query(User)
        .filter(User.user_id == user_id)
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active or user.is_archived:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # =====================================================
    # AUDIT CONTEXT
    # =====================================================

    current_user_id.set(user.user_id)

    current_ip_address.set(
        request.client.host
        if request.client
        else None
    )

    current_user_agent.set(
        request.headers.get("user-agent")
    )

    return user