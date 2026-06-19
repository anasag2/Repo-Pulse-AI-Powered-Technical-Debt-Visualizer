"""
Authentication routes: signup, login, and the current-user lookup.

Tokens are stateless JWTs (see app/services/auth.py). Protected endpoints
depend on `get_current_user`, which reads `Authorization: Bearer <token>`.
"""
from __future__ import annotations

from typing import Dict
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.errors import DuplicateKeyError

from app.schemas.api_models import AuthResponse, LoginInput, SignupInput, UserPublic
from app.services import auth, oauth
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
    if (
        user is None
        or not user.get("passwordHash")
        or not auth.verify_password(payload.password, user["passwordHash"])
    ):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = auth.create_access_token(user["id"])
    return {"accessToken": token, "tokenType": "bearer", "user": _public(user)}


@router.get("/me", response_model=UserPublic)
def me(current_user: Dict = Depends(get_current_user)):
    return _public(current_user)


# ─── Social login (OAuth) ────────────────────────────────────────────────────

def _find_or_create_oauth_user(identity: oauth.OAuthIdentity) -> Dict:
    """Resolve a provider identity to a local user.

    1. Match on (provider, providerId) — a returning social user.
    2. Else match on email — link the provider onto that existing account.
    3. Else create a brand-new passwordless user.
    """
    existing = store.get_user_by_provider(identity.provider, identity.provider_id)
    if existing is not None:
        return existing

    by_email = store.get_user_by_email(identity.email)
    if by_email is not None:
        store.link_provider(by_email["id"], identity.provider, identity.provider_id)
        return by_email

    return store.create_user(
        email=identity.email,
        name=identity.name,
        password_hash=None,
        provider=identity.provider,
        provider_id=identity.provider_id,
    )


def _frontend_redirect(*, token: str | None = None, error: str | None = None) -> RedirectResponse:
    """Bounce the browser back to the SPA, passing the result in the URL hash."""
    if token is not None:
        fragment = f"token={quote(token)}"
    else:
        fragment = f"error={quote(error or 'Login failed')}"
    return RedirectResponse(url=f"{oauth.FRONTEND_URL}/#{fragment}")


@router.get("/github/login")
def github_login():
    """Kick off the GitHub flow by redirecting to GitHub's authorize page."""
    try:
        state = oauth.issue_state("github")
        return RedirectResponse(url=oauth.github_authorize_url(state))
    except oauth.OAuthError as exc:
        return _frontend_redirect(error=str(exc))


@router.get("/github/callback")
def github_callback(request: Request):
    """Handle GitHub's redirect back: exchange the code and mint our own JWT."""
    params = request.query_params
    if params.get("error"):
        return _frontend_redirect(
            error=params.get("error_description") or params["error"]
        )

    code = params.get("code")
    state = params.get("state")
    if not code or not oauth.verify_state(state, "github"):
        return _frontend_redirect(error="Invalid OAuth state or missing code.")

    try:
        identity = oauth.github_exchange(code)
    except oauth.OAuthError as exc:
        return _frontend_redirect(error=str(exc))

    user = _find_or_create_oauth_user(identity)
    token = auth.create_access_token(user["id"])
    return _frontend_redirect(token=token)
