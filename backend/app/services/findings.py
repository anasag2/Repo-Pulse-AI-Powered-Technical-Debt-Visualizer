"""
Turns the technical-debt model's per-file scores into concrete, explained
"findings": the worst files, *why* they're flagged (which real signals are high),
and a concrete recommendation. Deterministic — no AI, no cost.
"""
from typing import Dict, List

from app.services.file_classify import is_analyzable

_TOP_N = 15
_MIN_TD = 0.05

_RECOMMENDATIONS = {
    "Hotspot":
        "Changes often *and* is complex — the riskiest combination. Refactor it "
        "into smaller, well-tested units before building more on top of it.",
    "God Class":
        "Large and complex — likely doing too much. Split its responsibilities "
        "into focused modules.",
    "Significant duplication":
        "Contains repeated code blocks. Extract the shared logic into one reusable "
        "function/module so fixes only have to happen once.",
    "Tight coupling":
        "Frequently changes together with the related files below — edits here tend "
        "to ripple. Consider decoupling behind a clearer interface.",
    "Defect-prone":
        "Has an above-average number of bug-fix commits. Add regression tests and "
        "review its error-prone paths.",
    "Complex logic":
        "High cyclomatic/cognitive complexity makes it hard to follow and test. "
        "Simplify conditionals and extract helper functions.",
    "Elevated technical debt":
        "Scores high on the technical-debt model. Review it for simplification and "
        "missing test coverage.",
}


def build_findings(files: List[Dict], coupling: List[Dict]) -> List[Dict]:
    code = [f for f in files if not f.get("isDirectory") and is_analyzable(f.get("path", ""))]
    if not code:
        return []

    # Per-file coupling degree (summed co-changes) and top partners.
    degree: Dict[int, int] = {}
    partners: Dict[int, List[tuple]] = {}
    for c in coupling:
        for fid, partner_path in (
            (c["fileAId"], c["pathB"]),
            (c["fileBId"], c["pathA"]),
        ):
            degree[fid] = degree.get(fid, 0) + c["coChanges"]
            partners.setdefault(fid, []).append((c["coChanges"], partner_path))

    def col(key):
        return [f.get(key, 0) or 0 for f in code]

    def avg(vals):
        return round(sum(vals) / len(vals), 1) if vals else 0

    def p80(vals):
        # Percentile over non-zero values so sparse metrics (coupling, duplication,
        # bug fixes) still flag their top contributors instead of collapsing to 0.
        s = sorted(v for v in vals if v > 0)
        return s[min(len(s) - 1, int(0.8 * len(s)))] if s else 0

    # Judge each metric against the repo's own distribution (80th percentile), so
    # a single huge outlier doesn't stop every other file from flagging.
    cols = {
        "cx": col("complexity"), "cog": col("cognitiveComplexity"),
        "loc": col("linesOfCode"), "ch": col("churnCommits"),
        "dup": col("duplicatedBlocks"), "bug": col("bugCommits"),
        "cpl": [degree.get(f["id"], 0) for f in code],
    }
    thr = {k: p80(v) for k, v in cols.items()}
    means = {k: avg(v) for k, v in cols.items()}

    def high(value, key):
        return thr[key] > 0 and value >= thr[key] and value > 0

    def detail(value, key):
        return f"{value} (repo avg {means[key]})"

    findings: List[Dict] = []
    for f in sorted(code, key=lambda x: x.get("riskScore", 0), reverse=True)[:_TOP_N]:
        td = f.get("riskScore", 0)
        if td < _MIN_TD:
            break
        fid = f["id"]
        cx, cog = f.get("complexity", 0), f.get("cognitiveComplexity", 0)
        loc, ch = f.get("linesOfCode", 0), f.get("churnCommits", 0)
        dup, bug = f.get("duplicatedBlocks", 0), f.get("bugCommits", 0)
        cpl, cov = degree.get(fid, 0), f.get("testCoverage", 0)

        factors = []
        if high(cx, "cx"): factors.append(("Cyclomatic complexity", detail(cx, "cx")))
        if high(cog, "cog"): factors.append(("Cognitive complexity", detail(cog, "cog")))
        if high(loc, "loc"): factors.append(("File size (LOC)", detail(loc, "loc")))
        if high(ch, "ch"): factors.append(("Churn (commits)", detail(ch, "ch")))
        if high(dup, "dup"): factors.append(("Duplicated blocks", detail(dup, "dup")))
        if high(cpl, "cpl"): factors.append(("Coupling (co-changes)", str(cpl)))
        if high(bug, "bug"): factors.append(("Bug-fix commits", detail(bug, "bug")))
        if cov < 40: factors.append(("Low test coverage (est.)", f"{cov}%"))

        # Category = the dominant story, most-actionable first.
        complex_high = high(cx, "cx") or high(cog, "cog")
        if high(ch, "ch") and complex_high:
            category = "Hotspot"                    # change × complexity — the worst combo
        elif high(loc, "loc") and complex_high:
            category = "God Class"                  # large & complex — doing too much
        elif high(bug, "bug"):
            category = "Defect-prone"               # repeatedly bug-fixed
        elif high(cpl, "cpl"):
            category = "Tight coupling"             # ripple risk
        elif high(dup, "dup"):
            category = "Significant duplication"
        elif complex_high:
            category = "Complex logic"
        else:
            category = "Elevated technical debt"

        if not factors:
            factors.append(("Technical-debt score", f"{td:.2f}"))

        related = []
        if high(cpl, "cpl"):
            related = [p for _, p in sorted(partners.get(fid, []), reverse=True)[:3]]

        findings.append({
            "fileId": fid,
            "path": f["path"],
            "name": f.get("name", ""),
            "tdScore": td,
            "category": category,
            "severity": "high" if td >= 0.35 else "medium" if td >= 0.15 else "low",
            "factors": [{"label": lbl, "detail": d} for lbl, d in factors],
            "recommendation": _RECOMMENDATIONS[category],
            "relatedPaths": related,
        })
    return findings
