import os
from datetime import datetime, timedelta, timezone
import logging

import bcrypt
import jwt
from fastapi import Cookie, HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

COOKIE_NAME = "ml_session"
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24


def _jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is not set")
    return secret


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_jwt(user_id: str, username: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired — please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token")


def get_current_user(ml_session: str | None = Cookie(default=None)) -> dict:
    if ml_session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return decode_jwt(ml_session)


def get_current_user_id(ml_session: str | None = Cookie(default=None)) -> str:
    payload = get_current_user(ml_session)
    return payload["sub"]


def set_auth_cookie(response: JSONResponse, token: str) -> None:
    is_production = os.environ.get("ENVIRONMENT", "").lower() == "production"
    # SameSite=None is required for cross-origin cookies (Vercel frontend → Railway backend)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="none" if is_production else "lax",
        secure=is_production,
        max_age=JWT_EXPIRY_HOURS * 3600,
        path="/",
    )


