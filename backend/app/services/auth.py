"""
Authentication primitives: password hashing (bcrypt) and JWT access tokens.

Config via env:
  JWT_SECRET           signing secret (set a strong value in prod)
  JWT_EXPIRE_DAYS      token lifetime in days (default 7)
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

_JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret-change-me")
_JWT_ALG = "HS256"
_JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "7"))

# bcrypt rejects passwords longer than 72 bytes; the API caps password length,
# but guard here too.
_MAX_PW_BYTES = 72


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")[:_MAX_PW_BYTES]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8")[:_MAX_PW_BYTES], password_hash.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(days=_JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALG)


def decode_token(token: str) -> Optional[int]:
    """Return the user id from a valid token, or None if invalid/expired."""
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALG])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
