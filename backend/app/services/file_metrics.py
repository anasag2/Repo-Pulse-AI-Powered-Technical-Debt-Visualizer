from pathlib import Path
from typing import Dict

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

def count_lines_of_code(full_path: str) -> int:
    try:
        with open(full_path, "r", encoding="utf-8", errors="ignore") as file:
            lines = file.readlines()

        code_lines = [
            line for line in lines
            if line.strip()
        ]

        return len(code_lines)
    except Exception:
        return 0

def build_basic_file_metrics(repo_path: str, relative_file_path: str) -> dict:
    full_path = Path(repo_path) / relative_file_path

    return {
        "path": relative_file_path,
        "language": detect_language(relative_file_path),
        "loc": count_lines_of_code(full_path),
        "size_bytes": full_path.stat().st_size if full_path.exists() else 0
    }

