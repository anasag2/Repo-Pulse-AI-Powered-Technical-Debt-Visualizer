"""
REST API that implements the frontend's OpenAPI contract under `/api`.

The generated `@workspace/api-client-react` client (base URL `/api`) calls these
endpoints. Handlers reuse the existing git-mining services and keep results in
an in-memory store (app/store.py).
"""
from __future__ import annotations

import shutil
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.auth_routes import get_current_user
from app.schemas.api_models import (
    AIFileInsight,
    AIReport,
    AIStatus,
    ChatInput,
    ChatModelsResponse,
    ChatResponse,
    Commit,
    CouplingPair,
    DashboardSummary,
    FileDetail,
    FileNode,
    HealthStatus,
    Repository,
    RepositoryInput,
    UserSettings,
)
from app.services import ai_analysis
from app.services import chat as chat_service
from app.services.analysis import build_repository_analysis
from app.services.repo_ingestion import clone_remote_repository
from app.store import store

router = APIRouter(prefix="/api", tags=["api"])


def _owned_or_404(repo_id: int, user: Dict) -> Dict:
    """Return the repo if the current user owns it, else 404 (don't leak existence)."""
    repo = store.get_repository(repo_id, owner_id=user["id"])
    if repo is None:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


def _normalize_git_url(url: str) -> str:
    """Accept inputs like `github.com/user/repo` and make them clonable."""
    url = url.strip()
    if url.startswith(("http://", "https://", "git@", "ssh://")):
        return url
    return f"https://{url}"


@router.get("/healthz", response_model=HealthStatus)
def health_check():
    return {"status": "ok"}


@router.get("/repositories", response_model=List[Repository])
def list_repositories(current: Dict = Depends(get_current_user)):
    return store.list_repositories(owner_id=current["id"])


@router.post(
    "/repositories",
    response_model=Repository,
    status_code=status.HTTP_201_CREATED,
)
def analyze_repository(payload: RepositoryInput,
                       current: Dict = Depends(get_current_user)):
    clone_url = _normalize_git_url(payload.url)

    ok, message, local_path = clone_remote_repository(clone_url)
    if not ok or not local_path:
        raise HTTPException(status_code=400, detail=message)

    repo_id = store.reserve_repo_id()
    success, analyze_msg, result = build_repository_analysis(
        repo_path=local_path,
        name=payload.name,
        url=payload.url,
        is_public=bool(payload.isPublic),
        repo_id=repo_id,
        next_file_id=store.peek_file_id(),
        next_commit_id=store.peek_commit_id(),
    )
    if not success:
        shutil.rmtree(local_path, ignore_errors=True)
        raise HTTPException(status_code=400, detail=analyze_msg)

    store.save_analysis(repo_id, result, local_path=local_path, owner_id=current["id"])
    return result["repository"]


@router.get("/repositories/{repo_id}", response_model=Repository)
def get_repository(repo_id: int, current: Dict = Depends(get_current_user)):
    return _owned_or_404(repo_id, current)


@router.delete("/repositories/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repository(repo_id: int, current: Dict = Depends(get_current_user)):
    _owned_or_404(repo_id, current)
    local_path = store.delete_repository(repo_id)
    if local_path:
        shutil.rmtree(local_path, ignore_errors=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/repositories/{repo_id}/files", response_model=List[FileNode])
def list_files(repo_id: int, current: Dict = Depends(get_current_user)):
    _owned_or_404(repo_id, current)
    return store.list_files(repo_id) or []


@router.get(
    "/repositories/{repo_id}/files/{file_id}",
    response_model=FileDetail,
)
def get_file(repo_id: int, file_id: int,
             current: Dict = Depends(get_current_user)):
    _owned_or_404(repo_id, current)
    detail = store.get_file(repo_id, file_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="File not found")
    return detail


@router.get("/repositories/{repo_id}/commits", response_model=List[Commit])
def list_commits(repo_id: int, current: Dict = Depends(get_current_user)):
    _owned_or_404(repo_id, current)
    return (store.list_commits(repo_id) or [])[:20]


@router.get("/repositories/{repo_id}/coupling", response_model=List[CouplingPair])
def list_coupling(repo_id: int, current: Dict = Depends(get_current_user)):
    _owned_or_404(repo_id, current)
    return store.list_coupling(repo_id) or []


@router.get("/ai/status", response_model=AIStatus)
def ai_status():
    return {"enabled": ai_analysis.ai_available(), "model": ai_analysis._MODEL}


# ─── Chat (multi-model assistant) ─────────────────────────────────────────────

@router.get("/chat/models", response_model=ChatModelsResponse)
def chat_models(current: Dict = Depends(get_current_user)):
    """Free models available for the dropdown + whether the server has a default key."""
    return {
        "models": chat_service.list_free_models(),
        "hasAppKey": bool(chat_service.app_api_key()),
    }


@router.post("/repositories/{repo_id}/chat", response_model=ChatResponse)
def repo_chat(repo_id: int, payload: ChatInput,
              current: Dict = Depends(get_current_user)):
    """Answer a chat turn grounded in this repo's metrics (+ the selected file)."""
    repo = _owned_or_404(repo_id, current)
    files = store.list_files(repo_id) or []
    selected = store.get_file(repo_id, payload.fileId) if payload.fileId else None

    model = payload.model or chat_service.DEFAULT_MODEL
    api_key = payload.apiKey or chat_service.app_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="No model key available. Add your own key in the chat settings, "
                   "or set OPENROUTER_API_KEY on the backend for the free experience.",
        )

    system = chat_service.build_repo_context(repo, files, selected)
    messages = [{"role": "system", "content": system}] + [
        {"role": m.role, "content": m.content} for m in payload.messages
    ]
    try:
        reply = chat_service.chat(messages, model=model, api_key=api_key)
    except chat_service.ChatError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"reply": reply, "model": model}


def _require_ai():
    if not ai_analysis.ai_available():
        raise HTTPException(
            status_code=503,
            detail="AI features are disabled. Set ANTHROPIC_API_KEY in the backend "
                   "environment to enable Claude-powered analysis.",
        )


@router.post(
    "/repositories/{repo_id}/files/{file_id}/ai-insight",
    response_model=AIFileInsight,
)
def ai_file_insight(repo_id: int, file_id: int,
                    current: Dict = Depends(get_current_user)):
    _require_ai()
    _owned_or_404(repo_id, current)
    detail = store.get_file(repo_id, file_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        insight = ai_analysis.analyze_file(
            repo_path=store.get_repo_path(repo_id),
            file_node=detail,
            risk_factors=detail.get("riskFactors", []),
        )
    except Exception as exc:  # API/auth/network errors from the model call
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}")

    return {
        "summary": insight.summary,
        "severity": insight.severity,
        "debtDrivers": insight.debt_drivers,
        "refactorSteps": insight.refactor_steps,
        "estimatedEffort": insight.estimated_effort,
    }


@router.post("/repositories/{repo_id}/ai-report", response_model=AIReport)
def ai_repo_report(repo_id: int, current: Dict = Depends(get_current_user)):
    _require_ai()
    repo = _owned_or_404(repo_id, current)

    files = [f for f in (store.list_files(repo_id) or []) if not f["isDirectory"]]
    top_files = sorted(files, key=lambda f: f.get("hotspotScore", 0), reverse=True)[:8]
    coupling = store.list_coupling(repo_id) or []

    try:
        markdown = ai_analysis.repo_report(repo, top_files, coupling)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI report failed: {exc}")

    return {"markdown": markdown, "model": ai_analysis._MODEL}


@router.get("/settings", response_model=UserSettings)
def get_settings(current: Dict = Depends(get_current_user)):
    # Stored values overlaid on defaults, so new keys get sensible defaults.
    return {**UserSettings().model_dump(), **store.get_settings(current["id"])}


@router.put("/settings", response_model=UserSettings)
def update_settings(payload: UserSettings,
                    current: Dict = Depends(get_current_user)):
    saved = store.save_settings(current["id"], payload.model_dump())
    return {**UserSettings().model_dump(), **saved}


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(current: Dict = Depends(get_current_user)):
    repos = store.list_repositories(owner_id=current["id"])

    total_repositories = len(repos)
    total_high_risk = 0
    total_files = 0
    for repo in repos:
        files = store.list_files(repo["id"]) or []
        file_only = [f for f in files if not f["isDirectory"]]
        total_files += len(file_only)
        total_high_risk += sum(1 for f in file_only if f["riskScore"] > 0.6)

    avg_risk = round(
        sum(r["avgRiskScore"] for r in repos) / total_repositories, 2
    ) if total_repositories else 0.0
    avg_cov = round(
        sum(r["testCoverage"] for r in repos) / total_repositories
    ) if total_repositories else 0
    recently_analyzed = list(reversed(repos))[:3]

    return {
        "totalRepositories": total_repositories,
        "totalFiles": total_files,
        "totalHighRiskFiles": total_high_risk,
        "avgRiskScore": avg_risk,
        "avgTestCoverage": avg_cov,
        "recentlyAnalyzed": recently_analyzed,
    }
