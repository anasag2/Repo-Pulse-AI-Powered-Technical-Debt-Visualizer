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

# Default to the most capable model; allow an override for cost-sensitive runs.
_MODEL = os.getenv("REPO_PULSE_AI_MODEL", "claude-opus-4-8")
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

    resp = _client().messages.parse(
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

    resp = _client().messages.create(
        model=_MODEL,
        max_tokens=4000,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        system=_SYSTEM_REPORT,
        messages=[{"role": "user", "content": prompt}],
    )
    return next((b.text for b in resp.content if b.type == "text"), "")
