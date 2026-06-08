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

def count_lines_and_markers(full_path: str) -> tuple[int, int]:
    """Non-blank line count and number of TODO/FIXME-style debt markers, in one read."""
    try:
        with open(full_path, "r", encoding="utf-8", errors="ignore") as file:
            text = file.read()
    except Exception:
        return 0, 0

    loc = sum(1 for line in text.splitlines() if line.strip())
    markers = len(_MARKER_RE.findall(text))
    return loc, markers

def build_basic_file_metrics(repo_path: str, relative_file_path: str) -> dict:
    full_path = Path(repo_path) / relative_file_path

    loc, markers = count_lines_and_markers(full_path)
    complexity = analyze_complexity(full_path)

    return {
        "path": relative_file_path,
        "language": detect_language(relative_file_path),
        "loc": loc,
        "size_bytes": full_path.stat().st_size if full_path.exists() else 0,
        "todo_markers": markers,
        "complexity_max": complexity["complexity_max"],
        "complexity_avg": complexity["complexity_avg"],
        "function_count": complexity["function_count"],
    }

