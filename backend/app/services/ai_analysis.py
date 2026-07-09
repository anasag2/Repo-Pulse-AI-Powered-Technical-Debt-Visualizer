"""
Claude-powered technical-debt analysis.

Two capabilities:
  - analyze_file():  per-file debt assessment + concrete refactor plan, returned
                     as a structured object (via the Messages structured-output API).
  - repo_report():   a narrative repository health report (markdown).

The Anthropic client resolves ANTHROPIC_API_KEY from the environment. When the
key is absent the service degrades gracefully — `ai_available()` returns False
and the routes surface a clear "configure a key" message instead of 500ing.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel

# Sonnet 4.6 is the sweet spot for these tasks (strong code understanding + prose
# at ~2/5 the cost of Opus); override via REPO_PULSE_AI_MODEL (e.g. claude-opus-4-8
# for the highest quality, or claude-haiku-4-5 — note: Haiku rejects the `effort`
# param used in repo_report, so it needs a code tweak before use).
# `or` (not getenv's default arg) so an empty env value — e.g. docker-compose
# passing ${REPO_PULSE_AI_MODEL:-} when unset — still falls back to the default.
_MODEL = os.getenv("REPO_PULSE_AI_MODEL") or "claude-sonnet-4-6"
# Haiku rejects the `effort` param + adaptive thinking; detect it so the one call
# that uses them (repo_report) can degrade gracefully and switching is safe.
_IS_HAIKU = "haiku" in _MODEL.lower()
# How much of a source file we send (chars). Keeps token usage bounded.
_MAX_FILE_CHARS = 8000


def ai_available() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def _client():
    # Imported lazily so the backend runs without `anthropic` installed / no key.
    import anthropic

    return anthropic.Anthropic()


class FileInsight(BaseModel):
    summary: str
    severity: Literal["low", "medium", "high"]
    debt_drivers: List[str]
    refactor_steps: List[str]
    estimated_effort: str


_SYSTEM_FILE = (
    "You are a senior software engineer performing a technical-debt review of a "
    "single source file. You are given git-derived metrics and a snippet of the "
    "file. Be concrete and specific to THIS file — reference real functions or "
    "patterns you see in the snippet. Keep each refactor step actionable. "
    "Calibrate severity to the metrics: high churn + high complexity + many bug "
    "fixes is high severity."
)


def _read_snippet(repo_path: str, rel_path: str) -> str:
    try:
        full = Path(repo_path) / rel_path
        text = full.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    if len(text) > _MAX_FILE_CHARS:
        return text[:_MAX_FILE_CHARS] + "\n... [truncated]"
    return text


def analyze_file(repo_path: Optional[str], file_node: Dict,
                 risk_factors: List[Dict]) -> FileInsight:
    """Per-file debt assessment. Raises on API/auth errors (routes translate them)."""
    snippet = _read_snippet(repo_path, file_node["path"]) if repo_path else ""
    drivers = ", ".join(
        f"{rf['name']} ({rf['score']})" for rf in risk_factors
    ) or "none flagged"

    prompt = (
        f"File: {file_node['path']}\n"
        f"Metrics:\n"
        f"- risk score: {file_node['riskScore']} (0-1)\n"
        f"- max cyclomatic complexity: {file_node.get('complexity', 0)}\n"
        f"- functions: {file_node.get('functionCount', 0)}\n"
        f"- churn (commits touching it): {file_node['churnCommits']}\n"
        f"- bug-fix commits: {file_node.get('bugCommits', 0)}\n"
        f"- lines of code: {file_node['linesOfCode']}\n"
        f"- authors: {file_node['authors']}\n"
        f"- days since last change: {file_node.get('ageDays', 0)}\n"
        f"- TODO/FIXME markers: {file_node.get('todoMarkers', 0)}\n"
        f"- contributing risk factors: {drivers}\n\n"
        f"Source snippet:\n```\n{snippet or '(source unavailable)'}\n```\n\n"
        "Assess the technical debt in this file and give a concrete refactor plan."
    )

    resp = _client().messages.parse(#Anthropic libary   
                model=_MODEL,
        max_tokens=2000,
        thinking={"type": "disabled"},
        system=_SYSTEM_FILE,
        messages=[{"role": "user", "content": prompt}],
        output_format=FileInsight,
    )
    return resp.parsed_output


_SYSTEM_REPORT = (
    "You are a staff engineer writing a concise technical-debt health report for "
    "a repository, for an engineering lead deciding where to invest refactoring "
    "effort. Use the supplied metrics. Be specific — name the actual hotspot "
    "files and coupled pairs. Output GitHub-flavored markdown with short sections: "
    "an overall assessment, the top risks (with why), notable architectural "
    "coupling, and a prioritized action list. Keep it under ~400 words."
)


def repo_report(repository: Dict, top_files: List[Dict],
                coupling: List[Dict]) -> str:
    """Narrative repo health report (markdown). Raises on API/auth errors."""
    files_md = "\n".join(
        f"- {f['path']}: risk {f['riskScore']}, hotspot {f.get('hotspotScore', 0)}, "
        f"complexity {f.get('complexity', 0)}, churn {f['churnCommits']}, "
        f"bug-fixes {f.get('bugCommits', 0)}, LOC {f['linesOfCode']}"
        for f in top_files
    )
    coupling_md = "\n".join(
        f"- {c['pathA']} <-> {c['pathB']} (co-changed {c['coChanges']}x, degree {c['degree']})"
        for c in coupling[:10]
    ) or "- (no significant temporal coupling detected)"

    prompt = (
        f"Repository: {repository['name']} ({repository['url']})\n"
        f"Totals: {repository['totalFiles']} files, {repository['linesOfCode']} LOC, "
        f"{repository['authors']} authors, avg risk {repository['avgRiskScore']}, "
        f"{repository['riskyFiles']} risky files ({repository['riskyFilesPercent']}%), "
        f"estimated debt {repository['technicalDebt']}.\n\n"
        f"Top hotspot files:\n{files_md}\n\n"
        f"Temporal coupling (files that change together):\n{coupling_md}\n\n"
        "Write the health report."
    )

    # Haiku doesn't support adaptive thinking / effort; the bigger models do.
    extra = {} if _IS_HAIKU else {
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": "medium"},
    }
    resp = _client().messages.create(
        model=_MODEL,
        max_tokens=4000,
        system=_SYSTEM_REPORT,
        messages=[{"role": "user", "content": prompt}],
        **extra,
    )
    return next((b.text for b in resp.content if b.type == "text"), "")


# ─── Tour authoring (educational walkthrough) ─────────────────────────────────
# The heuristic generator (services/tour.py) decides *which* files become stops
# and computes their metrics. This authors the *prose* for those stops, grounded
# in each file's real source — the "what" (role) and the "lesson".

_TOUR_SNIPPET_CHARS = 4000  # smaller than analyze_file: we need orientation, not depth


class AuthoredStop(BaseModel):
    id: str
    title: str    # short, vivid label (≤6 words)
    role: str     # what THIS file does + how it connects, referencing real code
    lesson: str   # the debt concept, anchored to this file's metrics


class AuthoredTour(BaseModel):
    summary: str
    stops: List[AuthoredStop]


_SYSTEM_TOUR = (
    "You are writing an educational guided tour of a real repository for a developer "
    "who is brand new to it. The goal: de-blackbox the codebase. You're given the "
    "repo's totals and an ordered list of stops; each stop names a file, the debt "
    "concept it illustrates, that file's metrics, and a source snippet.\n\n"
    "For EVERY stop id you receive, write three fields:\n"
    "- title: a short, vivid label (max 6 words), no file path.\n"
    "- role: 2-3 sentences in plain English — what this file actually does and how it "
    "connects to the rest of the app. Reference real functions/classes from the snippet.\n"
    "- lesson: 2-3 sentences teaching the named debt concept, anchored to THIS file's "
    "metrics (cite the real numbers). Teach, don't just describe.\n"
    "Also write an overall 'summary' (2-3 sentences) orienting the newcomer. "
    "Be concrete and specific; no marketing fluff. Keep each field under ~60 words. "
    "Return all stop ids you were given."
)


_SYSTEM_TOUR_CODE = (
    "You are giving a developer who is brand new to a codebase a guided tour of how it "
    "WORKS — its architecture and what the code actually does — NOT a technical-debt "
    "review. You're given the repo's totals and an ordered list of stops; each stop names "
    "a file, the architectural role it plays, basic facts, and a source snippet.\n\n"
    "For EVERY stop id you receive, write three fields:\n"
    "- title: a short, vivid label (max 6 words), no file path.\n"
    "- role: 2-4 sentences in plain English — what this file/module does and the key "
    "functions or classes inside it (name the real ones from the snippet) and what each "
    "is responsible for.\n"
    "- lesson: 2-3 sentences on how this fits into the overall architecture — what it "
    "depends on, what uses it, and where it sits in the control or data flow.\n"
    "Also write an overall 'summary' (2-3 sentences) describing the app's architecture at "
    "a high level. Be concrete and reference real code. Do NOT discuss churn, risk, "
    "complexity scores, test coverage, or any other debt metrics — this tour is about "
    "understanding the code. Keep each field under ~70 words. Return all stop ids."
)


def author_tour(repository: Dict, stops: List[Dict], repo_path: Optional[str],
                kind: str = "debt") -> AuthoredTour:
    """Author rich prose for an already-selected set of tour stops. `kind` selects the
    lens: "code" (how it works) or "debt" (technical-debt review). Raises on API/auth
    errors so the caller can fall back to the heuristic text."""
    blocks: List[str] = []
    for s in stops:
        metrics = ", ".join(f"{m['label']}={m['value']}" for m in s.get("metrics", [])) or "n/a"
        snippet = ""
        if repo_path and s.get("path"):
            snippet = _read_snippet(repo_path, s["path"])
            if len(snippet) > _TOUR_SNIPPET_CHARS:
                snippet = snippet[:_TOUR_SNIPPET_CHARS] + "\n... [truncated]"
        blocks.append(
            f"### stop id: {s['id']}\n"
            f"concept: {s['concept']} — {s.get('conceptTitle', '')}\n"
            f"file: {s.get('path') or '(repository overview — no single file)'}\n"
            f"metrics: {metrics}\n"
            f"source snippet:\n```\n{snippet or '(not applicable / source unavailable)'}\n```"
        )

    prompt = (
        f"Repository: {repository['name']} ({repository.get('url', '')})\n"
        f"Totals: {repository.get('totalFiles', 0)} files, "
        f"{repository.get('linesOfCode', 0)} LOC, {repository.get('authors', 0)} authors, "
        f"avg risk {repository.get('avgRiskScore', 0)}.\n\n"
        f"Author the tour for these {len(stops)} stops:\n\n" + "\n\n".join(blocks)
    )

    resp = _client().messages.parse(
        model=_MODEL,
        max_tokens=3000,
        thinking={"type": "disabled"},
        system=_SYSTEM_TOUR_CODE if kind == "code" else _SYSTEM_TOUR,
        messages=[{"role": "user", "content": prompt}],
        output_format=AuthoredTour,
    )
    return resp.parsed_output
