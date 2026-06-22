"""
Multi-model chat over OpenAI-compatible providers (default: OpenRouter).

The chatbot is grounded in the current repository: a compact summary of its
metrics — plus the file the user is looking at, if any — is injected as system
context. Any provider that speaks the OpenAI `/chat/completions` shape works;
you just swap base URL + model + key, so one integration covers many models.

Free models (e.g. OpenRouter's ":free" variants) let the app answer at no
per-message cost for demos. Users may also bring their own key (passed per
request from the browser, never stored server-side).

Config via env:
  OPENROUTER_API_KEY   default key for the free/demo experience (optional)
"""
from __future__ import annotations

import os
from typing import Dict, List, Optional

import httpx

# Default gateway: OpenRouter — OpenAI-compatible, multi-model, with free options.
OPENROUTER_BASE = "https://openrouter.ai/api/v1"

# Used only if the live catalogue can't be fetched.
_FALLBACK_MODELS: List[Dict] = [
    {"id": "meta-llama/llama-3.3-70b-instruct:free", "label": "Llama 3.3 70B (free)", "free": True},
    {"id": "google/gemini-2.0-flash-exp:free", "label": "Gemini 2.0 Flash (free)", "free": True},
    {"id": "deepseek/deepseek-chat:free", "label": "DeepSeek Chat (free)", "free": True},
    {"id": "qwen/qwen-2.5-72b-instruct:free", "label": "Qwen 2.5 72B (free)", "free": True},
]

DEFAULT_MODEL = _FALLBACK_MODELS[0]["id"]


class ChatError(Exception):
    """Raised on any provider/transport failure; mapped to a 502 by the route."""


def app_api_key() -> Optional[str]:
    """The server's default OpenRouter key (powers the free experience), if set."""
    return os.getenv("OPENROUTER_API_KEY")


def list_free_models() -> List[Dict]:
    """Return OpenRouter's free models (pricing == 0). Falls back to a curated set."""
    try:
        with httpx.Client(timeout=8.0) as client:
            res = client.get(f"{OPENROUTER_BASE}/models")
            res.raise_for_status()
            data = res.json().get("data", [])
        free = [
            {"id": m["id"], "label": m.get("name", m["id"]), "free": True}
            for m in data
            if str(m.get("pricing", {}).get("prompt")) == "0"
            and str(m.get("pricing", {}).get("completion")) == "0"
        ]
        free.sort(key=lambda x: x["label"])
        return free or _FALLBACK_MODELS
    except Exception:
        return _FALLBACK_MODELS


def _file_line(f: Dict) -> str:
    return (
        f"- {f.get('path')} · risk {f.get('riskScore')} · churn {f.get('churnCommits')} · "
        f"cplx {f.get('complexity')} · cov {f.get('testCoverage')}% · {f.get('linesOfCode')} LOC"
    )


def build_repo_context(repo: Dict, files: List[Dict], selected: Optional[Dict]) -> str:
    """Compact system prompt: repo stats + top risky files + the selected file."""
    lines = [
        f'You are Repo-Pulse\'s assistant, helping a developer understand technical '
        f'debt in the repository "{repo.get("name")}".',
        "Answer concisely and concretely, grounded in the metrics below. If the user "
        "asks about something not present in this data, say so rather than guessing.",
        "",
        "REPOSITORY",
        f"- Name: {repo.get('name')}   URL: {repo.get('url')}",
        f"- Files: {repo.get('totalFiles')}   Lines of code: {repo.get('linesOfCode')}",
        f"- Risky files: {repo.get('riskyFiles')} ({repo.get('riskyFilesPercent')}%)",
        f"- Average risk score: {repo.get('avgRiskScore')}   Test coverage: {repo.get('testCoverage')}%",
        f"- Technical debt estimate: {repo.get('technicalDebt')}",
    ]

    real = [f for f in files if not f.get("isDirectory")]
    top = sorted(real, key=lambda f: f.get("riskScore", 0), reverse=True)[:12]
    if top:
        lines += ["", "TOP RISKY FILES", *[_file_line(f) for f in top]]

    if selected:
        lines += ["", "CURRENTLY SELECTED FILE (the user is looking at this)", _file_line(selected)]
        rfs = selected.get("riskFactors") or []
        if rfs:
            lines.append("  Risk factors: " + ", ".join(
                f"{r.get('name')} ({r.get('score')})" for r in rfs
            ))

    return "\n".join(lines)


def chat(messages: List[Dict], model: str, api_key: str, base_url: str = OPENROUTER_BASE) -> str:
    """POST to an OpenAI-compatible chat endpoint; return the assistant's text."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        # OpenRouter attribution (harmless on other providers).
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Repo-Pulse",
    }
    payload = {"model": model, "messages": messages, "max_tokens": 1024}
    try:
        with httpx.Client(timeout=60.0) as client:
            res = client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise ChatError(f"Couldn't reach the model provider: {exc}")

    if res.status_code == 401:
        raise ChatError("The API key was rejected (401). Check the key for the selected model.")
    if not res.is_success:
        try:
            detail = res.json().get("error", {}).get("message") or res.text
        except Exception:
            detail = res.text
        raise ChatError(f"Provider error ({res.status_code}): {detail}")

    try:
        return res.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise ChatError("The provider returned an empty response.")
