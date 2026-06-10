"""
Authentication routes: signup, login, and the current-user lookup.

Tokens are stateless JWTs (see app/services/auth.py). Protected endpoints
depend on `get_current_user`, which reads `Authorization: Bearer <token>`.
"""
from __future__ import annotations

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.errors import DuplicateKeyError

from app.schemas.api_models import AuthResponse, LoginInput, SignupInput, UserPublic
from app.services import auth
from app.store import store

router = APIRouter(prefix="/api/auth", tags=["auth"])

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> Dict:
    """FastAPI dependency — resolves the bearer token to a user, or 401s."""
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = auth.decode_token(creds.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = store.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _public(user: Dict) -> Dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "createdAt": user["createdAt"],
    }


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupInput):
    email = payload.email.lower().strip()
    try:
        user = store.create_user(
            email=email,
            name=payload.name.strip(),
            password_hash=auth.hash_password(payload.password),
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    token = auth.create_access_token(user["id"])
    return {"accessToken": token, "tokenType": "bearer", "user": _public(user)}


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginInput):
    email = payload.email.lower().strip()
    user = store.get_user_by_email(email)
    if user is None or not auth.verify_password(payload.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = auth.create_access_token(user["id"])
    return {"accessToken": token, "tokenType": "bearer", "user": _public(user)}


@router.get("/me", response_model=UserPublic)
def me(current_user: Dict = Depends(get_current_user)):
    return _public(current_user)
