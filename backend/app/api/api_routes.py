"""
REST API that implements the frontend's OpenAPI contract under `/api`.

The generated `@workspace/api-client-react` client (base URL `/api`) calls these
endpoints. Handlers reuse the existing git-mining services and keep results in
an in-memory store (app/store.py).
"""
from __future__ import annotations

import shutil
from typing import List

from fastapi import APIRouter, HTTPException, Response, status

from app.schemas.api_models import (
    Commit,
    DashboardSummary,
    FileDetail,
    FileNode,
    HealthStatus,
    Repository,
    RepositoryInput,
)
from app.services.analysis import build_repository_analysis
from app.services.repo_ingestion import clone_remote_repository
from app.store import store

router = APIRouter(prefix="/api", tags=["api"])


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
def list_repositories():
    return store.list_repositories()


@router.post(
    "/repositories",
    response_model=Repository,
    status_code=status.HTTP_201_CREATED,
)
def analyze_repository(payload: RepositoryInput):
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

    store.save_analysis(repo_id, result, local_path=local_path)
    return result["repository"]


@router.get("/repositories/{repo_id}", response_model=Repository)
def get_repository(repo_id: int):
    repo = store.get_repository(repo_id)
    if repo is None:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.delete("/repositories/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repository(repo_id: int):
    local_path = store.delete_repository(repo_id)
    if local_path:
        shutil.rmtree(local_path, ignore_errors=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/repositories/{repo_id}/files", response_model=List[FileNode])
def list_files(repo_id: int):
    files = store.list_files(repo_id)
    if files is None:
        raise HTTPException(status_code=404, detail="Repository not found")
    return files


@router.get(
    "/repositories/{repo_id}/files/{file_id}",
    response_model=FileDetail,
)
def get_file(repo_id: int, file_id: int):
    detail = store.get_file(repo_id, file_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="File not found")
    return detail


@router.get("/repositories/{repo_id}/commits", response_model=List[Commit])
def list_commits(repo_id: int):
    commits = store.list_commits(repo_id)
    if commits is None:
        raise HTTPException(status_code=404, detail="Repository not found")
    return commits[:20]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary():
    repos = store.list_repositories()

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
