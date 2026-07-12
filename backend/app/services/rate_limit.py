"""
In-memory rate limiting for auth endpoints (login/signup/forgot-password).

Sliding-window counter keyed by client IP (X-Forwarded-For aware, since Caddy
sits in front in prod) and, optionally, a field from the request body (e.g.
"email") — so a distributed brute force against ONE account is still caught
even if the attacker rotates IPs, and a single noisy IP can't lock out
requests aimed at many different accounts.

Per-process and in-memory: correct for this deployment (a single uvicorn
worker — see backend/Dockerfile), but resets on restart and won't be shared
across multiple worker processes if the deployment ever scales that way. A
shared store (e.g. Redis) would be the next step at that point.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_hits: Dict[str, Deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check(key: str, max_requests: int, window_seconds: float) -> None:
    now = time.monotonic()
    with _lock:
        hits = _hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= max_requests:
            retry_after = int(window_seconds - (now - hits[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again later.",
                headers={"Retry-After": str(max(retry_after, 1))},
            )
        hits.append(now)


def limiter(max_requests: int, window_seconds: float, *, by_body_field: Optional[str] = None):
    """FastAPI dependency factory: limits by client IP, optionally combined with
    a field read from the JSON body (e.g. "email"). Use via the route
    decorator's `dependencies=[Depends(limiter(...))]` — no need to accept it
    as a named parameter."""
    async def _dep(request: Request) -> None:
        _check(f"ip:{_client_ip(request)}", max_requests, window_seconds)
        if by_body_field:
            try:
                body = await request.json()
                value = str(body.get(by_body_field, "")).strip().lower()
            except Exception:
                value = ""
            if value:
                _check(f"{by_body_field}:{value}", max_requests, window_seconds)
    return _dep
