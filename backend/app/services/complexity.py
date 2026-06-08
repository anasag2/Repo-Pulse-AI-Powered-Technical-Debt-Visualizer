"""
Real cyclomatic complexity via `lizard` (multi-language: Python, JS/TS, Java,
C/C++, C#, Go, ...). This replaces the old `LOC / 12` size proxy with an actual
measured signal.

For each file we report the *max* CCN across its functions (how bad the worst
function is) plus the average and a function count. Non-code files (JSON, MD,
YAML, ...) or parse failures yield zeros — honestly "not measurable" rather than
a fabricated number.
"""
from __future__ import annotations
from typing import Dict
import lizard


def analyze_complexity(full_path: str) -> Dict[str, int]:
    try:
        info = lizard.analyze_file(str(full_path))
        funcs = info.function_list
        if not funcs:
            return {"complexity_max": 0, "complexity_avg": 0, "function_count": 0}
        ccns = [f.cyclomatic_complexity for f in funcs]
        return {
            "complexity_max": max(ccns),
            "complexity_avg": round(sum(ccns) / len(ccns)),
            "function_count": len(funcs),
        }
    except Exception:
        # lizard raises on a few exotic encodings / unsupported syntaxes.
        return {"complexity_max": 0, "complexity_avg": 0, "function_count": 0}
