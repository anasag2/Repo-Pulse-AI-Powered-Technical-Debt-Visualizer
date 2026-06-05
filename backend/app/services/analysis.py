"""
Turns raw git-mining output into the data shapes the frontend expects
(Repository / FileNode / FileDetail / Commit / DashboardSummary).

Real signals (lines of code, churn, contributor counts, commit history) come
straight from git. A few fields the miner does not measure — complexity, test
coverage and technical debt — are derived heuristics from those real signals so
the visualization has something meaningful to show. They are clearly marked
below.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Dict, List, Tuple

from app.services.git_mining import get_basic_repository_metrics, get_recent_commits


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _author_initials(name: str) -> str:
    parts = [p for p in name.replace("-", " ").replace("_", " ").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def _risk_score(churn: int, loc: int, authors: int,
                max_churn: int, max_loc: int, max_authors: int) -> float:
    """Weighted blend of normalized churn, size and author spread (0..1)."""
    norm_churn = churn / max_churn if max_churn else 0
    norm_loc = loc / max_loc if max_loc else 0
    norm_authors = authors / max_authors if max_authors else 0
    score = 0.5 * norm_churn + 0.3 * norm_loc + 0.2 * norm_authors
    return round(_clamp(score), 2)


def _estimate_complexity(loc: int) -> int:
    """Heuristic: ~1 unit of cyclomatic-ish complexity per dozen lines."""
    return max(1, min(60, round(loc / 12)))


def _estimate_coverage(risk_score: float, path: str) -> int:
    """
    Heuristic test-coverage proxy (the miner does not run tests). Files that
    look like tests are assumed well covered; otherwise coverage falls as risk
    rises.
    """
    lowered = path.lower()
    if "test" in lowered or "spec" in lowered or "__tests__" in lowered:
        return 90
    return int(_clamp(0.9 - risk_score * 0.7, 0.05, 0.95) * 100)


def _format_technical_debt(risky_files: int, avg_risk: float) -> str:
    hours = risky_files * 3 + round(avg_risk * 40)
    days, rem = divmod(hours, 24)
    return f"{days}d {rem}h"


def build_repository_analysis(
    repo_path: str,
    name: str,
    url: str,
    is_public: bool,
    repo_id: int,
    next_file_id: int,
    next_commit_id: int,
) -> Tuple[bool, str, Dict]:
    """
    Run the full analysis for a single repository.

    Returns (success, message, payload) where payload has keys:
        repository  -> Repository dict
        files       -> list[FileNode dict]
        file_extras -> { fileId: {riskFactors, recentCommits} }
        commits     -> list[Commit dict]
    """
    ok, message, metrics = get_basic_repository_metrics(repo_path)
    if not ok:
        return False, message, {}

    _, _, raw_commits = get_recent_commits(repo_path, limit=30)

    # ---- Commits ---------------------------------------------------------
    commits: List[Dict] = []
    cid = next_commit_id
    for rc in raw_commits:
        commits.append(
            {
                "id": cid,
                "repoId": repo_id,
                "message": rc["message"] or "(no message)",
                "author": rc["author"],
                "authorInitials": _author_initials(rc["author"]),
                "timeAgo": rc["time_ago"],
                "hash": rc["hash"],
            }
        )
        cid += 1
    recent_commits = commits[:5]

    # ---- Per-file metrics + normalization --------------------------------
    max_churn = max((m.get("churn", 0) for m in metrics), default=0)
    max_loc = max((m.get("loc", 0) for m in metrics), default=0)
    max_authors = max(
        (m.get("ownership", {}).get("contributors_count", 0) for m in metrics),
        default=0,
    )

    files: List[Dict] = []
    file_extras: Dict[int, Dict] = {}
    all_authors = set()

    fid = next_file_id
    for m in metrics:
        path = m["path"]
        loc = m.get("loc", 0)
        churn = m.get("churn", 0)
        ownership = m.get("ownership", {})
        authors = ownership.get("contributors_count", 0)
        all_authors.update((ownership.get("contributors") or {}).keys())

        risk = _risk_score(churn, loc, authors, max_churn, max_loc, max_authors)
        coverage = _estimate_coverage(risk, path)
        complexity = _estimate_complexity(loc)

        node = {
            "id": fid,
            "repoId": repo_id,
            "name": os.path.basename(path) or path,
            "path": path,
            "parentPath": os.path.dirname(path),
            "isDirectory": False,
            "riskScore": risk,
            "churnCommits": churn,
            "linesOfCode": loc,
            "complexity": complexity,
            "testCoverage": coverage,
            "authors": authors,
        }
        files.append(node)

        risk_factors = [
            {"name": "High Churn",
             "score": round(0.5 * (churn / max_churn if max_churn else 0), 2)},
            {"name": "Large File Size",
             "score": round(0.3 * (loc / max_loc if max_loc else 0), 2)},
            {"name": "Many Authors",
             "score": round(0.2 * (authors / max_authors if max_authors else 0), 2)},
            {"name": "Low Test Coverage",
             "score": round((100 - coverage) / 100 * 0.3, 2)},
        ]
        file_extras[fid] = {
            "riskFactors": [rf for rf in risk_factors if rf["score"] > 0],
            "recentCommits": recent_commits,
        }
        fid += 1

    # ---- Directory nodes (aggregated from their descendant files) --------
    dir_paths = set()
    for node in files:
        parent = node["parentPath"]
        while parent:
            dir_paths.add(parent)
            parent = os.path.dirname(parent)

    for dpath in sorted(dir_paths):
        children = [f for f in files if f["path"].startswith(dpath + "/")]
        if not children:
            continue
        avg_risk = round(sum(c["riskScore"] for c in children) / len(children), 2)
        avg_cov = round(sum(c["testCoverage"] for c in children) / len(children))
        dir_node = {
            "id": fid,
            "repoId": repo_id,
            "name": os.path.basename(dpath) or dpath,
            "path": dpath,
            "parentPath": os.path.dirname(dpath),
            "isDirectory": True,
            "riskScore": avg_risk,
            "churnCommits": sum(c["churnCommits"] for c in children),
            "linesOfCode": sum(c["linesOfCode"] for c in children),
            "complexity": 0,
            "testCoverage": avg_cov,
            "authors": len({c["authors"] for c in children}),
        }
        files.append(dir_node)
        file_extras[fid] = {"riskFactors": [], "recentCommits": recent_commits}
        fid += 1

    # ---- Repository aggregate --------------------------------------------
    file_only = [f for f in files if not f["isDirectory"]]
    total_files = len(file_only)
    lines_of_code = sum(f["linesOfCode"] for f in file_only)
    risky_files = sum(1 for f in file_only if f["riskScore"] > 0.6)
    risky_pct = round(risky_files / total_files * 100, 1) if total_files else 0.0
    avg_risk = round(
        sum(f["riskScore"] for f in file_only) / total_files, 2
    ) if total_files else 0.0
    avg_cov = round(
        sum(f["testCoverage"] for f in file_only) / total_files
    ) if total_files else 0

    repository = {
        "id": repo_id,
        "name": name,
        "url": url,
        "isPublic": is_public,
        "lastAnalyzed": datetime.now().strftime("%b %d, %Y, %I:%M %p"),
        "totalFiles": total_files,
        "linesOfCode": lines_of_code,
        "riskyFiles": risky_files,
        "riskyFilesPercent": risky_pct,
        "authors": len(all_authors),
        "lastCommit": raw_commits[0]["time_ago"] if raw_commits else "unknown",
        "avgRiskScore": avg_risk,
        "testCoverage": avg_cov,
        "technicalDebt": _format_technical_debt(risky_files, avg_risk),
    }

    return True, "Repository analyzed successfully.", {
        "repository": repository,
        "files": files,
        "file_extras": file_extras,
        "commits": commits,
    }
