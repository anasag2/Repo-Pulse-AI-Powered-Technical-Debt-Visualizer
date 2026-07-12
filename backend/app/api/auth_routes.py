"""
Authentication routes: signup, login, and the current-user lookup.

Tokens are stateless JWTs (see app/services/auth.py). Protected endpoints
depend on `get_current_user`, which reads `Authorization: Bearer <token>`.
"""
from __future__ import annotations

import hashlib
import secrets
import shutil
from datetime import datetime, timedelta, timezone
from typing import Dict
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.errors import DuplicateKeyError

from app.schemas.api_models import (
    AuthResponse,
    DeleteAccountInput,
    ForgotPasswordInput,
    LoginInput,
    MessageResponse,
    ResetPasswordInput,
    SignupInput,
    TokenValidity,
    UpdateProfileInput,
    UserPublic,
)
from app.services import auth, email as email_service, oauth
from app.services.rate_limit import limiter
from app.store import store

_RESET_TTL = timedelta(hours=1)
_DELETE_CODE_TTL = timedelta(minutes=10)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

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
        "provider": user.get("provider"),
    }


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    # 10 signups/hour per IP — throttles bulk fake-account creation without
    # bothering a real user who mistypes a field a couple of times.
    dependencies=[Depends(limiter(10, 3600))],
)
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


@router.post(
    "/login",
    response_model=AuthResponse,
    # 8 attempts/5min per IP AND per email — catches both a brute force against
    # one account (even from rotating IPs) and credential-stuffing across many
    # accounts from one IP.
    dependencies=[Depends(limiter(8, 300, by_body_field="email"))],
)
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


@router.patch("/me", response_model=UserPublic)
def update_me(payload: UpdateProfileInput, current_user: Dict = Depends(get_current_user)):
    store.update_user_name(current_user["id"], payload.name.strip())
    return _public({**current_user, "name": payload.name.strip()})


@router.post("/me/delete-code", response_model=MessageResponse)
def request_delete_code(current_user: Dict = Depends(get_current_user)):
    """Email a 6-digit confirmation code, required before /me can be deleted."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    store.create_delete_code(
        current_user["id"], _hash_token(code), datetime.now(timezone.utc) + _DELETE_CODE_TTL
    )
    email_service.send_delete_account_code(current_user["email"], code)
    return {"message": f"A confirmation code was sent to {current_user['email']}."}


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(payload: DeleteAccountInput, current_user: Dict = Depends(get_current_user)):
    """Permanently delete the current user and everything they own (repos,
    clones on disk, settings). Irreversible. Requires a code from
    /me/delete-code, emailed to the account's address."""
    record = store.get_active_delete_code(current_user["id"])
    if record is None or record["codeHash"] != _hash_token(payload.code.strip()):
        raise HTTPException(status_code=400, detail="That code is invalid or has expired.")
    store.consume_delete_code(current_user["id"])

    local_paths = store.delete_user(current_user["id"])
    for path in local_paths:
        shutil.rmtree(path, ignore_errors=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Password reset ──────────────────────────────────────────────────────────

_GENERIC_RESET_MSG = "If an account with that email exists, a reset link has been sent."


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    # 5/hour per IP and per email — stops both mass token generation and
    # email-bombing one address with reset links.
    dependencies=[Depends(limiter(5, 3600, by_body_field="email"))],
)
def forgot_password(payload: ForgotPasswordInput):
    """Issue a reset token and email it. Always returns the same message so the
    response can't be used to discover which emails are registered."""
    email = payload.email.lower().strip()
    user = store.get_user_by_email(email)
    if user is not None:
        raw_token = secrets.token_urlsafe(32)
        store.create_password_reset(
            user["id"], _hash_token(raw_token), datetime.now(timezone.utc) + _RESET_TTL
        )
        reset_url = f"{oauth.FRONTEND_URL}/reset-password?token={raw_token}"
        email_service.send_password_reset(email, reset_url)
    return {"message": _GENERIC_RESET_MSG}


@router.get("/reset-password/validate", response_model=TokenValidity)
def validate_reset_token(token: str):
    """Non-consuming check used by the reset page to show a dead link as expired."""
    return {"valid": store.get_active_password_reset(_hash_token(token)) is not None}


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordInput):
    """Consume a valid token and set the new password (also works for OAuth-only
    accounts, which then gain a password they can log in with)."""
    token_hash = _hash_token(payload.token)
    record = store.get_active_password_reset(token_hash)
    if record is None:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    store.set_password(record["userId"], auth.hash_password(payload.password))
    store.consume_password_reset(token_hash)
    return {"message": "Your password has been updated. You can now log in."}


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


# Per-provider plumbing: how to build the authorize URL and how to exchange a
# code for a verified identity. Adding a provider is just an entry here plus the
# two thin routes below.
_AUTHORIZE_URL = {
    "github": oauth.github_authorize_url,
    "google": oauth.google_authorize_url,
}
_EXCHANGE = {
    "github": oauth.github_exchange,
    "google": oauth.google_exchange,
}


def _oauth_login(provider: str) -> RedirectResponse:
    """Kick off a provider flow by redirecting to its authorize page."""
    try:
        state = oauth.issue_state(provider)
        return RedirectResponse(url=_AUTHORIZE_URL[provider](state))
    except oauth.OAuthError as exc:
        return _frontend_redirect(error=str(exc))


def _oauth_callback(provider: str, request: Request) -> RedirectResponse:
    """Handle a provider's redirect back: exchange the code and mint our JWT."""
    params = request.query_params
    if params.get("error"):
        return _frontend_redirect(
            error=params.get("error_description") or params["error"]
        )

    code = params.get("code")
    state = params.get("state")
    if not code or not oauth.verify_state(state, provider):
        return _frontend_redirect(error="Invalid OAuth state or missing code.")

    try:
        identity = _EXCHANGE[provider](code)
    except oauth.OAuthError as exc:
        return _frontend_redirect(error=str(exc))

    user = _find_or_create_oauth_user(identity)
    token = auth.create_access_token(user["id"])
    return _frontend_redirect(token=token)


@router.get("/github/login")
def github_login():
    return _oauth_login("github")


@router.get("/github/callback")
def github_callback(request: Request):
    return _oauth_callback("github", request)


@router.get("/google/login")
def google_login():
    return _oauth_login("google")


@router.get("/google/callback")
def google_callback(request: Request):
    return _oauth_callback("google", request)
