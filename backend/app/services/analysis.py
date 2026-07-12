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
from typing import Dict, List, Optional, Tuple

from app.services.git_mining import (
    get_basic_repository_metrics,
    get_recent_commits,
    get_temporal_coupling,
)
from app.services.duplication import compute_duplication
from app.services.file_classify import is_analyzable


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


# ── Technical-debt model ─────────────────────────────────────────────────────
# Adapted from the Lund University thesis TD model (Borg & Wangel, 2021):
#   TD_i = Σ W_k · M_k   over per-repo min–max normalised metrics.
# The thesis used 8 metrics with weights grounded in a literature study + expert
# interviews (~80% agreement with developers). We now compute all 8, so these are
# the paper's exact weights. `per_loc` divides by file size first (compare files
# fairly); `sign = -1` means the metric REDUCES debt — more comments and more
# functions imply better documentation / decomposition.
_TD_MODEL = [
    # key,           weight,  per_loc, sign
    ("complexity",   0.125,   True,   +1),   # cyclomatic complexity   (12.5%)
    ("cognitive",    0.175,   True,   +1),   # cognitive complexity    (17.5%)
    ("loc",          0.15,    False,  +1),   # lines of code           (15%)
    ("commits",      0.15,    False,  +1),   # churn                   (15%)
    ("duplication",  0.125,   True,   +1),   # duplicated blocks       (12.5%)
    ("coupling",     0.125,   False,  +1),   # coupling                (12.5%)
    ("comments",     0.075,   True,   -1),   # comment lines           (-7.5%)
    ("functions",    0.075,   True,   -1),   # function count          (-7.5%)
]

# Human labels for each TD-model metric — used for the risk-factor panel and the
# AI prompt so the score, the UI, and Claude all describe the same drivers.
_TD_LABELS = {
    "complexity":  "Cyclomatic complexity",
    "cognitive":   "Cognitive complexity",
    "loc":         "File size",
    "commits":     "Churn",
    "duplication": "Code duplication",
    "coupling":    "Temporal coupling",
    "comments":    "Comment coverage",
    "functions":   "Function decomposition",
}


def _td_raw_inputs(m: Dict, coupling_by_path: Dict[str, float],
                   dup_by_path: Dict[str, int]) -> Dict[str, float]:
    """The raw (pre-normalisation) TD metric values for one file, with the
    thesis's per-LOC divisions applied."""
    loc = m.get("loc", 0) or 0
    div = loc if loc else 1
    return {
        "complexity": (m.get("complexity_max", 0) or 0) / div,
        "cognitive": (m.get("cognitive_complexity", 0) or 0) / div,
        "loc": float(loc),
        "commits": float(m.get("churn", 0) or 0),
        "duplication": (dup_by_path.get(m["path"], 0) or 0) / div,
        "coupling": float(coupling_by_path.get(m["path"], 0.0)),
        "comments": (m.get("comment_lines", 0) or 0) / div,
        "functions": (m.get("function_count", 0) or 0) / div,
    }


def _technical_debt(raw: Dict[str, float],
                    bounds: Dict[str, Tuple[float, float]]
                    ) -> Tuple[float, List[Dict]]:
    """Weighted sum of min–max normalised metrics → per-file TD in [0, 1].

    Also returns the per-metric contribution breakdown (the actual drivers of the
    score: sign · weight · normalised value), so the UI risk-factor panel and the AI
    prompt can explain the number using the exact model that produced it — rather than
    a separate ad-hoc heuristic. Positive contributions push debt up; negative ones
    (comments, functions) pull it down.
    """
    score = 0.0
    contributions: List[Dict] = []
    for key, weight, _per_loc, sign in _TD_MODEL:
        lo, hi = bounds.get(key, (0.0, 0.0))
        norm = (raw[key] - lo) / (hi - lo) if hi > lo else 0.0
        contribution = sign * weight * norm
        score += contribution
        contributions.append({
            "key": key,
            "name": _TD_LABELS[key],
            "weight": weight,
            "normalized": round(norm, 3),
            "contribution": round(contribution, 4),
        })
    return round(_clamp(score), 2), contributions


def build_repository_analysis(
    repo_path: str,
    name: str,
    url: str,
    is_public: bool,
    repo_id: int,
    next_file_id: int,
    next_commit_id: int,
    existing_path_to_id: Optional[Dict[str, int]] = None,
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
    # (max_churn / max_complexity feed the hotspot signal below; the TD model
    # normalises via its own per-metric bounds, not these maxima.)
    max_churn = max((m.get("churn", 0) for m in metrics), default=0)
    max_complexity = max((m.get("complexity_max", 0) for m in metrics), default=0)

    # ---- Technical-debt model inputs -------------------------------------
    # Temporal coupling per file (summed co-change count); reused for the graph.
    _, _, raw_coupling = get_temporal_coupling(repo_path)
    coupling_by_path: Dict[str, float] = {}
    for pair in raw_coupling:
        coupling_by_path[pair["fileA"]] = coupling_by_path.get(pair["fileA"], 0.0) + pair["coChanges"]
        coupling_by_path[pair["fileB"]] = coupling_by_path.get(pair["fileB"], 0.0) + pair["coChanges"]
    # Duplicated blocks per file (repo-wide near-duplicate detection).
    dup_by_path = compute_duplication(repo_path, [m["path"] for m in metrics])
    # Per-repo min–max bounds so each metric normalises to [0,1] before weighting.
    # Computed over CODE files only — configs/docs/lockfiles would otherwise skew
    # the bounds (a generated lockfile inflating the LOC/churn maxima, etc.).
    _td_all = [_td_raw_inputs(m, coupling_by_path, dup_by_path)
               for m in metrics if is_analyzable(m["path"])]
    td_bounds: Dict[str, Tuple[float, float]] = {}
    for _key, _w, _p, _s in _TD_MODEL:
        _vals = [r[_key] for r in _td_all] or [0.0]
        td_bounds[_key] = (min(_vals), max(_vals))

    files: List[Dict] = []
    file_extras: Dict[int, Dict] = {}
    all_authors = set()
    path_to_id: Dict[str, int] = {}

    # Reuse ids for paths that already existed (refresh) so file ids stay stable
    # across reanalysis — otherwise open panels / links to old ids break.
    existing = existing_path_to_id or {}
    fid = next_file_id
    for m in metrics:
        path = m["path"]
        loc = m.get("loc", 0)
        churn = m.get("churn", 0)
        complexity = m.get("complexity_max", 0)
        bug_commits = m.get("bug_commits", 0)
        age_days = m.get("last_age_days", 0)
        todo_markers = m.get("todo_markers", 0)
        function_count = m.get("function_count", 0)
        ownership = m.get("ownership", {})
        authors = ownership.get("contributors_count", 0)
        all_authors.update((ownership.get("contributors") or {}).keys())
        # Real per-file contributors (name + commit count), most commits first, so
        # the file panel's Contributors tab shows actual people, not "Contributor N".
        # Capped since the UI lists only the top handful.
        contributors = sorted(
            ({"name": name, "commits": commits}
             for name, commits in (ownership.get("contributors") or {}).items()),
            key=lambda c: c["commits"], reverse=True,
        )[:10]

        # Only code files get a technical-debt score; configs/docs/data score 0
        # (still stored + shown on the map, just not part of the debt analysis).
        if is_analyzable(path):
            risk, td_contributions = _technical_debt(
                _td_raw_inputs(m, coupling_by_path, dup_by_path), td_bounds)
        else:
            risk, td_contributions = 0.0, []
        coverage = _estimate_coverage(risk, path)

        # Hotspot: the canonical debt signal — code that is both complex AND
        # changes a lot. Normalized complexity x normalized churn, in [0,1].
        norm_complexity = complexity / max_complexity if max_complexity else 0
        norm_churn = churn / max_churn if max_churn else 0
        hotspot = round(norm_complexity * norm_churn, 2)

        node_id = existing.get(path)
        if node_id is None:
            node_id = fid
            fid += 1
        node = {
            "id": node_id,
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
            "hotspotScore": hotspot,
            "bugCommits": bug_commits,
            "ageDays": age_days,
            "todoMarkers": todo_markers,
            "functionCount": function_count,
            "cognitiveComplexity": m.get("cognitive_complexity", 0),
            "duplicatedBlocks": dup_by_path.get(path, 0),
            "commentLines": m.get("comment_lines", 0),
            "couplingDegree": int(coupling_by_path.get(path, 0.0)),
            "contributors": contributors,
        }
        files.append(node)
        path_to_id[path] = node_id

        # Risk factors ARE the debt model's own drivers: each positive-contribution
        # metric as a share of the file's total upward push, so the panel, the score,
        # and the AI all agree. (comments/functions only ever reduce debt, so they
        # never surface here.) Scores land in [0,1] and sum to 1 across the drivers.
        drivers = sorted(
            (c for c in td_contributions if c["contribution"] > 0),
            key=lambda c: c["contribution"], reverse=True,
        )
        total_push = sum(c["contribution"] for c in drivers) or 1.0
        risk_factors = [
            {"name": c["name"], "score": round(c["contribution"] / total_push, 2)}
            for c in drivers
        ]
        file_extras[node_id] = {
            "riskFactors": [rf for rf in risk_factors if rf["score"] > 0],
            # Full per-metric breakdown (all 8, incl. debt-reducing ones) for the AI
            # so it explains the score with the exact model that produced it.
            "tdContributions": td_contributions,
            "recentCommits": recent_commits,
        }

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
        avg_hotspot = round(sum(c["hotspotScore"] for c in children) / len(children), 2)
        dir_id = existing.get(dpath)
        if dir_id is None:
            dir_id = fid
            fid += 1
        dir_node = {
            "id": dir_id,
            "repoId": repo_id,
            "name": os.path.basename(dpath) or dpath,
            "path": dpath,
            "parentPath": os.path.dirname(dpath),
            "isDirectory": True,
            "riskScore": avg_risk,
            "churnCommits": sum(c["churnCommits"] for c in children),
            "linesOfCode": sum(c["linesOfCode"] for c in children),
            "complexity": max((c["complexity"] for c in children), default=0),
            "testCoverage": avg_cov,
            "authors": len({c["authors"] for c in children}),
            "hotspotScore": avg_hotspot,
            "bugCommits": sum(c["bugCommits"] for c in children),
            "ageDays": min((c["ageDays"] for c in children), default=0),
            "todoMarkers": sum(c["todoMarkers"] for c in children),
            "functionCount": sum(c["functionCount"] for c in children),
            "cognitiveComplexity": sum(c.get("cognitiveComplexity", 0) for c in children),
            "duplicatedBlocks": sum(c.get("duplicatedBlocks", 0) for c in children),
            "commentLines": sum(c.get("commentLines", 0) for c in children),
            "couplingDegree": sum(c.get("couplingDegree", 0) for c in children),
        }
        files.append(dir_node)
        file_extras[dir_id] = {"riskFactors": [], "recentCommits": recent_commits}

    # ---- Repository aggregate --------------------------------------------
    file_only = [f for f in files if not f["isDirectory"]]
    total_files = len(file_only)
    lines_of_code = sum(f["linesOfCode"] for f in file_only)
    # Debt aggregates are over code files only (TD isn't scored for non-code).
    code_only = [f for f in file_only if is_analyzable(f["path"])]
    n_code = len(code_only)
    risky_files = sum(1 for f in code_only if f["riskScore"] > 0.6)
    risky_pct = round(risky_files / n_code * 100, 1) if n_code else 0.0
    avg_risk = round(sum(f["riskScore"] for f in code_only) / n_code, 2) if n_code else 0.0
    avg_cov = round(sum(f["testCoverage"] for f in code_only) / n_code) if n_code else 0

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
        # Project TD index (0–100): the mean per-file TD from the weighted model.
        "technicalDebt": f"{round(avg_risk * 100)}",
    }

    # ---- Temporal coupling (file pairs that change together) --------------
    coupling: List[Dict] = []
    for pair in raw_coupling:
        a_id = path_to_id.get(pair["fileA"])
        b_id = path_to_id.get(pair["fileB"])
        if a_id is None or b_id is None:
            continue
        coupling.append({
            "fileAId": a_id,
            "fileBId": b_id,
            "fileA": os.path.basename(pair["fileA"]),
            "fileB": os.path.basename(pair["fileB"]),
            "pathA": pair["fileA"],
            "pathB": pair["fileB"],
            "coChanges": pair["coChanges"],
            "degree": pair["degree"],
        })

    return True, "Repository analyzed successfully.", {
        "repository": repository,
        "files": files,
        "file_extras": file_extras,
        "commits": commits,
        "coupling": coupling,
    }
