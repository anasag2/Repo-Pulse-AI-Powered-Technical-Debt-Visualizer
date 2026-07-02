"""
Transactional email — currently just password-reset links.

Provider-agnostic: if RESEND_API_KEY is set, send via Resend; otherwise (dev)
log the link to the backend console so the flow is fully testable without any
email setup.

Config via env:
  RESEND_API_KEY   Resend API key (prod). Unset → dev console fallback.
  EMAIL_FROM       From address, e.g. "Repo-Pulse <noreply@repo-pulse.com>"
"""
from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger("repo_pulse.email")

_RESEND_ENDPOINT = "https://api.resend.com/emails"


def _from_address() -> str:
    # resend.dev works out-of-the-box for testing to your own address; use a
    # verified domain sender (noreply@repo-pulse.com) in production.
    return os.getenv("EMAIL_FROM", "Repo-Pulse <onboarding@resend.dev>")


def send_password_reset(to_email: str, reset_url: str) -> None:
    """Email a password-reset link, or log it in dev when no key is configured."""
    api_key = os.getenv("RESEND_API_KEY")
    subject = "Reset your Repo-Pulse password"
    html = (
        '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">'
        "<h2 style=\"color:#10b981\">Reset your password</h2>"
        "<p>We received a request to reset your Repo-Pulse password. "
        "Click the button below to choose a new one. This link expires in 1 hour.</p>"
        f'<p><a href="{reset_url}" style="display:inline-block;background:#10b981;'
        'color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;'
        'font-weight:600">Reset password</a></p>'
        f'<p style="color:#64748b;font-size:13px">Or paste this link:<br>{reset_url}</p>'
        "<p style=\"color:#64748b;font-size:13px\">If you didn't request this, you "
        "can safely ignore this email.</p></div>"
    )

    if not api_key:
        # Dev fallback — copy this link from the backend console to test.
        print(f"\n[DEV] Password-reset link for {to_email}:\n  {reset_url}\n", flush=True)
        log.warning("Password reset (dev, no RESEND_API_KEY) for %s", to_email)
        return

    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.post(
                _RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"from": _from_address(), "to": [to_email], "subject": subject, "html": html},
            )
        if not res.is_success:
            log.error("Resend send failed (%s): %s", res.status_code, res.text)
    except Exception as exc:  # never let email failures leak to the caller
        log.error("Resend send error: %s", exc)


def send_delete_account_code(to_email: str, code: str) -> None:
    """Email a one-time account-deletion confirmation code, or log it in dev
    when no key is configured."""
    api_key = os.getenv("RESEND_API_KEY")
    subject = "Confirm deleting your Repo-Pulse account"
    html = (
        '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">'
        '<h2 style="color:#ef4444">Confirm account deletion</h2>'
        "<p>Use this code to permanently delete your Repo-Pulse account and all its "
        "repositories. This code expires in 10 minutes.</p>"
        f'<p style="font-size:28px;font-weight:700;letter-spacing:4px;'
        f'background:#1e293b;color:#fff;padding:12px 20px;border-radius:8px;'
        f'display:inline-block">{code}</p>'
        "<p style=\"color:#64748b;font-size:13px\">If you didn't request this, you "
        "can safely ignore this email — your account will not be deleted.</p></div>"
    )

    if not api_key:
        print(f"\n[DEV] Account-deletion code for {to_email}: {code}\n", flush=True)
        log.warning("Account-deletion code (dev, no RESEND_API_KEY) for %s", to_email)
        return

    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.post(
                _RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"from": _from_address(), "to": [to_email], "subject": subject, "html": html},
            )
        if not res.is_success:
            log.error("Resend send failed (%s): %s", res.status_code, res.text)
    except Exception as exc:
        log.error("Resend send error: %s", exc)
