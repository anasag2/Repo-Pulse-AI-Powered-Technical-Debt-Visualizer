"""
OAuth (social login) helpers.

Currently implements GitHub's "authorization code" flow. The flow only produces
a verified identity (provider + provider id + email + name); the route handler
then find-or-creates a local user and mints the SAME JWT used by email/password
login (see app/services/auth.py). So OAuth is purely additive.

The CSRF `state` is a short-lived JWT signed with JWT_SECRET, so we don't need
any server-side session storage between the /login redirect and the /callback.

Config via env:
  GITHUB_CLIENT_ID        GitHub OAuth app client id
  GITHUB_CLIENT_SECRET    GitHub OAuth app client secret
  GOOGLE_CLIENT_ID        Google OAuth client id
  GOOGLE_CLIENT_SECRET    Google OAuth client secret
  OAUTH_REDIRECT_BASE     base URL the provider calls back to
                          (default http://localhost:8000)
  FRONTEND_URL            where we send the browser after success
                          (default http://localhost:5173)
  JWT_SECRET              reused to sign the state token
"""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
import jwt

_JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret-change-me")
_JWT_ALG = "HS256"
_STATE_EXPIRE_MINUTES = 10

_OAUTH_REDIRECT_BASE = os.getenv("OAUTH_REDIRECT_BASE", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# GitHub endpoints.
_GH_AUTHORIZE = "https://github.com/login/oauth/authorize"
_GH_TOKEN = "https://github.com/login/oauth/access_token"
_GH_API = "https://api.github.com"

# Google endpoints.
_GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo"


@dataclass
class OAuthIdentity:
    """The verified identity returned by a provider."""
    provider: str          # "github"
    provider_id: str        # the provider's stable user id (as a string)
    email: str
    name: str


class OAuthError(Exception):
    """Raised on any provider/exchange failure; mapped to an error redirect."""


# ─── state (CSRF) token ──────────────────────────────────────────────────────

def issue_state(provider: str) -> str:
    """Mint a short-lived signed state token for the given provider."""
    now = datetime.now(timezone.utc)
    payload = {
        "purpose": "oauth_state",
        "provider": provider,
        "nonce": secrets.token_urlsafe(16),
        "iat": now,
        "exp": now + timedelta(minutes=_STATE_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALG)


def verify_state(state: Optional[str], provider: str) -> bool:
    if not state:
        return False
    try:
        payload = jwt.decode(state, _JWT_SECRET, algorithms=[_JWT_ALG])
    except jwt.PyJWTError:
        return False
    return (
        payload.get("purpose") == "oauth_state"
        and payload.get("provider") == provider
    )


# ─── GitHub ──────────────────────────────────────────────────────────────────

def _github_credentials() -> tuple[str, str]:
    client_id = os.getenv("GITHUB_CLIENT_ID")
    client_secret = os.getenv("GITHUB_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise OAuthError(
            "GitHub login is not configured "
            "(set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)."
        )
    return client_id, client_secret


def github_callback_url() -> str:
    return f"{_OAUTH_REDIRECT_BASE}/api/auth/github/callback"


def github_authorize_url(state: str) -> str:
    """Build the URL we redirect the browser to so the user can authorize."""
    client_id, _ = _github_credentials()
    params = {
        "client_id": client_id,
        "redirect_uri": github_callback_url(),
        "scope": "read:user user:email",
        "state": state,
        "allow_signup": "true",
    }
    return f"{_GH_AUTHORIZE}?{urlencode(params)}"


def github_exchange(code: str) -> OAuthIdentity:
    """Exchange the authorization code for an identity (token never leaves here)."""
    client_id, client_secret = _github_credentials()
    with httpx.Client(timeout=10.0) as client:
        token_res = client.post(
            _GH_TOKEN,
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": github_callback_url(),
            },
        )
        token_data = token_res.json() if token_res.is_success else {}
        access_token = token_data.get("access_token")
        if not access_token:
            raise OAuthError("GitHub did not return an access token.")

        auth_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
        }
        user_res = client.get(f"{_GH_API}/user", headers=auth_headers)
        if not user_res.is_success:
            raise OAuthError("Could not fetch GitHub profile.")
        gh_user = user_res.json()

        email = _github_primary_email(client, auth_headers, gh_user)

    provider_id = str(gh_user.get("id"))
    name = gh_user.get("name") or gh_user.get("login") or "GitHub user"
    return OAuthIdentity(
        provider="github",
        provider_id=provider_id,
        email=email,
        name=name,
    )


def _github_primary_email(client: httpx.Client, headers: dict, gh_user: dict) -> str:
    """Pick the verified primary email; fall back to GitHub's noreply address."""
    res = client.get(f"{_GH_API}/user/emails", headers=headers)
    if res.is_success:
        emails = res.json()
        # Prefer a verified primary, then any verified, then any.
        for predicate in (
            lambda e: e.get("primary") and e.get("verified"),
            lambda e: e.get("verified"),
            lambda e: True,
        ):
            match = next((e for e in emails if predicate(e)), None)
            if match and match.get("email"):
                return match["email"].lower().strip()
    # Public email on the profile, else a stable noreply address.
    if gh_user.get("email"):
        return gh_user["email"].lower().strip()
    login = gh_user.get("login") or gh_user.get("id")
    return f"{login}@users.noreply.github.com"


# ─── Google ──────────────────────────────────────────────────────────────────

def _google_credentials() -> tuple[str, str]:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise OAuthError(
            "Google login is not configured "
            "(set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)."
        )
    return client_id, client_secret


def google_callback_url() -> str:
    return f"{_OAUTH_REDIRECT_BASE}/api/auth/google/callback"


def google_authorize_url(state: str) -> str:
    """Build the URL we redirect the browser to so the user can authorize."""
    client_id, _ = _google_credentials()
    params = {
        "client_id": client_id,
        "redirect_uri": google_callback_url(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{_GOOGLE_AUTHORIZE}?{urlencode(params)}"


def google_exchange(code: str) -> OAuthIdentity:
    """Exchange the authorization code for an identity (token never leaves here)."""
    client_id, client_secret = _google_credentials()
    with httpx.Client(timeout=10.0) as client:
        token_res = client.post(
            _GOOGLE_TOKEN,
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": google_callback_url(),
            },
        )
        token_data = token_res.json() if token_res.is_success else {}
        access_token = token_data.get("access_token")
        if not access_token:
            raise OAuthError("Google did not return an access token.")

        userinfo_res = client.get(
            _GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if not userinfo_res.is_success:
            raise OAuthError("Could not fetch Google profile.")
        info = userinfo_res.json()

    email = info.get("email")
    if not email:
        raise OAuthError("Google account did not provide an email.")
    name = info.get("name") or email.split("@")[0]
    return OAuthIdentity(
        provider="google",
        provider_id=str(info.get("sub")),
        email=email.lower().strip(),
        name=name,
    )
