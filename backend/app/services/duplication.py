"""
Repo-wide near-duplicate detection — an approximation of SonarQube's "Duplicated
Blocks" metric, which the TD model weights at 12.5%.

We slide a window of `_WINDOW` consecutive non-trivial (stripped, length >= 5)
lines across every file and hash each window. A window is "duplicated" if the
same sequence occurs more than once anywhere in the repo (within a file or
across files). Per file we report the count of its distinct duplicated windows.
Requiring 6 identical consecutive lines keeps false positives (imports, braces)
low without needing a token-level clone detector.
"""
from pathlib import Path
from collections import defaultdict
from typing import Dict, List

_WINDOW = 6
_MIN_LINE_LEN = 5


def compute_duplication(repo_path: str, paths: List[str]) -> Dict[str, int]:
    occurrences: Dict[int, int] = defaultdict(int)
    file_windows: Dict[str, List[int]] = {}

    for rel in paths:
        try:
            with open(Path(repo_path) / rel, "r", encoding="utf-8", errors="ignore") as fh:
                lines = [ln.strip() for ln in fh.read().splitlines()]
        except Exception:
            continue
        lines = [ln for ln in lines if len(ln) >= _MIN_LINE_LEN]
        if len(lines) < _WINDOW:
            file_windows[rel] = []
            continue
        windows = [hash(tuple(lines[i:i + _WINDOW])) for i in range(len(lines) - _WINDOW + 1)]
        file_windows[rel] = windows
        for h in windows:
            occurrences[h] += 1

    return {
        rel: len({h for h in windows if occurrences[h] > 1})
        for rel, windows in file_windows.items()
    }
