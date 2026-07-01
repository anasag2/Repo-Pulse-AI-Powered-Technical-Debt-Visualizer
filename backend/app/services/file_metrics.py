from pathlib import Path
from typing import Dict
import re

from app.services.complexity import analyze_complexity

# Debt markers left in source comments. Counted as a small, honest debt signal.
_MARKER_RE = re.compile(r"\b(TODO|FIXME|HACK|XXX|BUG)\b")

LANGUAGE_BY_EXTENSION: Dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".java": "Java",
    ".cs": "C#",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".c": "C",
    ".h": "C/C++ Header",
    ".hpp": "C++ Header",
    ".html": "HTML",
    ".css": "CSS",
    ".json": "JSON",
    ".md": "Markdown",

    ".sh": "Shell Script",
    ".bash": "Shell",
    ".zsh": "Shell",

    ".yaml": "YAML",
    ".yml": "YAML",
}

def detect_language(file_path: str) -> str:
    extension = Path(file_path).suffix.lower()
    return LANGUAGE_BY_EXTENSION.get(extension, "Unknown")

_LINE_COMMENT_PREFIXES = ("//", "#", "--", ";", "%")


def _count_comment_lines(text: str) -> int:
    """Heuristic comment-line count across common languages. Tracks the usual
    block styles (/* */, <!-- -->, triple-quoted) and line-comment prefixes.
    Approximate by design — it feeds a low-weighted term in the TD model."""
    count = 0
    block_end = None  # active block terminator we're waiting for
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if block_end:
            count += 1
            if block_end in line:
                block_end = None
            continue
        if line.startswith("/*"):
            count += 1
            if "*/" not in line[2:]:
                block_end = "*/"
        elif line.startswith("<!--"):
            count += 1
            if "-->" not in line[4:]:
                block_end = "-->"
        elif line.startswith('"""') or line.startswith("'''"):
            q = line[:3]
            count += 1
            if not (len(line) > 3 and q in line[3:]):
                block_end = q
        elif line.startswith(_LINE_COMMENT_PREFIXES) or line.startswith("*"):
            count += 1
    return count


_COG_KEYWORDS = re.compile(r"\b(if|elif|for|foreach|while|case|when|catch|except|switch)\b")
_COG_BOOL = re.compile(r"&&|\|\||\band\b|\bor\b")


def _cognitive_complexity(text: str, python_like: bool) -> int:
    """Approximation of SonarQube's Cognitive Complexity: +1 for each control-flow
    break, plus a penalty equal to the current nesting depth, plus +1 per boolean
    operator in a condition. Nesting is tracked by indentation (Python) or brace
    depth (C-family). Deterministic and language-agnostic — not byte-identical to
    SonarQube, but it captures the same "how hard is this to follow" signal."""
    total = 0
    depth = 0
    for raw in text.splitlines():
        line = raw.strip()
        is_comment = line.startswith(("#", "//", "*", "/*", "<!--"))
        if line and not is_comment:
            if python_like:
                expanded = raw.expandtabs(4)
                nesting = (len(expanded) - len(expanded.lstrip(" "))) // 4
            else:
                nesting = depth
            kw = len(_COG_KEYWORDS.findall(line))
            if kw:
                total += kw * (1 + max(0, nesting))
            total += len(_COG_BOOL.findall(line))
        if not python_like:
            depth += raw.count("{") - raw.count("}")
            if depth < 0:
                depth = 0
    return total


def build_basic_file_metrics(repo_path: str, relative_file_path: str) -> dict:
    full_path = Path(repo_path) / relative_file_path
    try:
        with open(full_path, "r", encoding="utf-8", errors="ignore") as fh:
            text = fh.read()
    except Exception:
        text = ""

    loc = sum(1 for line in text.splitlines() if line.strip())
    markers = len(_MARKER_RE.findall(text))
    comment_lines = _count_comment_lines(text)
    language = detect_language(relative_file_path)
    cognitive = _cognitive_complexity(text, python_like=(language == "Python"))
    complexity = analyze_complexity(full_path)

    return {
        "path": relative_file_path,
        "language": language,
        "loc": loc,
        "size_bytes": full_path.stat().st_size if full_path.exists() else 0,
        "todo_markers": markers,
        "comment_lines": comment_lines,
        "cognitive_complexity": cognitive,
        "complexity_max": complexity["complexity_max"],
        "complexity_avg": complexity["complexity_avg"],
        "function_count": complexity["function_count"],
    }

