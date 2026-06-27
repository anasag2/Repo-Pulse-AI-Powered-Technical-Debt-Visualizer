"""
Build an educational walkthrough ("tour") of a repository.

A tour is a curated, ordered set of stops. Each stop is *hybrid*: it explains
what a file does ("the what") and teaches the technical-debt concept that file
happens to illustrate ("the lesson") — so the same tour onboards a newcomer and
teaches debt concepts at once.

This module ships the **heuristic** generator: it picks representative files from
the real metrics (no LLM) and fills in templated copy. It returns the exact same
shape an AI generator will, so the front-end and API contract don't change when
we swap in Claude later — the AI path just sets generated=True with richer prose.
"""
from __future__ import annotations

import os
from typing import Dict, List, Optional

# Filenames that are conventionally a program's entry point, most-specific first.
_ENTRY_NAMES = (
    "main.py", "__main__.py", "app.py", "server.py", "manage.py", "cli.py", "wsgi.py", "asgi.py",
    "index.ts", "index.tsx", "index.js", "main.ts", "main.tsx", "app.tsx", "app.ts",
    "__init__.py",  # a package's public surface — the closest thing to an entry for a library
)

# Source-code extensions. The tour should land on real code, not configs/docs/data,
# so we filter to these (falling back to all files only if a repo has none).
_CODE_EXT = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".java", ".go", ".rs",
    ".rb", ".php", ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".swift", ".kt",
    ".scala", ".m", ".mm", ".vue", ".svelte", ".sh", ".sql", ".r", ".dart",
    ".ex", ".exs", ".clj", ".lua",
}


def _is_code(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in _CODE_EXT


# Extension → human language label, for the code-walkthrough stat chips.
_LANG = {
    ".py": "Python", ".ts": "TypeScript", ".tsx": "TypeScript (React)",
    ".js": "JavaScript", ".jsx": "JavaScript (React)", ".mjs": "JavaScript",
    ".go": "Go", ".rs": "Rust", ".rb": "Ruby", ".java": "Java", ".kt": "Kotlin",
    ".php": "PHP", ".c": "C", ".h": "C header", ".cpp": "C++", ".hpp": "C++ header",
    ".cs": "C#", ".swift": "Swift", ".vue": "Vue", ".svelte": "Svelte",
    ".sh": "Shell", ".sql": "SQL", ".scala": "Scala", ".rb_": "Ruby",
}


def _lang(path: str) -> str:
    return _LANG.get(os.path.splitext(path)[1].lower(), "Code")


def _matches(path: str, words: tuple) -> bool:
    p = path.lower()
    return any(w in p for w in words)


def _is_aux(path: str) -> bool:
    """Tests, examples, docs, and hidden/config dirs (.github, .devcontainer, …) —
    real but not the implementation a 'how it works' tour should headline."""
    if any(seg.startswith(".") for seg in path.split("/")[:-1]):  # hidden directory
        return True
    return _is_test(path) or _matches(path, _NON_ENTRY_DIRS)


def _risk_tone(score: float) -> str:
    if score < 0.3:
        return "good"
    if score < 0.7:
        return "warn"
    return "bad"


def _is_test(path: str) -> bool:
    p = path.lower()
    return "test" in p or "spec" in p or p.startswith("tests/") or "/tests/" in p


# Directories whose files are demos/tests/docs — not the app's real entry point.
_NON_ENTRY_DIRS = (
    "examples/", "example/", "tests/", "test/", "docs/", "doc/",
    "samples/", "sample/", "benchmarks/", "fixtures/",
)


def _entry_rank(f: Dict) -> tuple:
    """Lower is more entry-point-like: real source beats demos/tests, then a known
    name beats a shallow path beats churn."""
    path = (f.get("path") or "").lower()
    location = 1 if any(seg in path for seg in _NON_ENTRY_DIRS) else 0
    name = (f.get("name") or "").lower()
    named = _ENTRY_NAMES.index(name) if name in _ENTRY_NAMES else len(_ENTRY_NAMES)
    depth = path.count("/")
    return (location, named, depth, -f.get("churnCommits", 0))


def _metric(label: str, value: str, tone: str = "neutral") -> Dict:
    return {"label": label, "value": value, "tone": tone}


def _file_metrics(f: Dict) -> List[Dict]:
    """The small stat chips shown on a stop card."""
    risk = f.get("riskScore", 0.0)
    risk_label = "low" if risk < 0.3 else "moderate" if risk < 0.7 else "high"
    cov = f.get("testCoverage", 0)
    return [
        _metric("Risk", risk_label, _risk_tone(risk)),
        _metric("Churn", f"{f.get('churnCommits', 0)} commits",
                "bad" if f.get("churnCommits", 0) > 40 else "neutral"),
        _metric("Complexity", str(f.get("complexity", 0)),
                "bad" if f.get("complexity", 0) > 15 else "warn" if f.get("complexity", 0) > 8 else "good"),
        _metric("Coverage", f"{cov}%", "bad" if cov < 40 else "warn" if cov < 70 else "good"),
        _metric("Authors", str(f.get("authors", 0))),
    ]


def build_heuristic_tour(repo: Dict, files: List[Dict], coupling: List[Dict]) -> Dict:
    """Assemble a RepoTour-shaped dict from real metrics, no LLM involved."""
    non_dir = [f for f in files if not f.get("isDirectory")]
    # Prefer real source files; fall back to everything only if the repo has none.
    code = [f for f in non_dir if _is_code(f.get("path", ""))] or non_dir
    repo_name = repo.get("name", "this repository")

    summary = (
        f"{repo_name} has {len(code)} code files across {repo.get('authors', 0)} "
        f"contributors. This tour walks the files that matter most — where the app "
        f"starts, where complexity and change concentrate, and where the hidden risk "
        f"lives — and uses each one to teach a technical-debt concept."
    )

    if not code:
        return {
            "repoId": repo["id"], "generated": False, "model": "heuristic",
            "summary": summary,
            "stops": [{
                "id": "overview", "fileId": None, "path": None,
                "title": f"Welcome to {repo_name}",
                "role": "This repository hasn't been analyzed into files yet, so there's "
                        "nothing to tour. Run an analysis to unlock the walkthrough.",
                "concept": "overview", "conceptTitle": "Start with a map",
                "lesson": "Before reading code, get the lay of the land: which files are "
                          "central, which change often, and which are risky.",
                "metrics": [], "relatedFileIds": [],
            }],
            "debtOrder": [],
        }

    stops: List[Dict] = []
    used: set = set()

    def pick(key, reverse: bool = True, pred=None) -> Optional[Dict]:
        """Best *unused* file by `key`. Picking from unused (rather than picking the
        global best then discarding duplicates) keeps each stop on a distinct file
        when possible — so the hotspot, the maze, and the coverage gap don't all
        collapse onto the same worst file."""
        cands = [f for f in code if f["id"] not in used and (pred(f) if pred else True)]
        if not cands:
            return None
        chosen = sorted(cands, key=key, reverse=reverse)[0]
        used.add(chosen["id"])
        return chosen

    # 0. Overview — orientation for the whole repo (not tied to one file).
    stops.append({
        "id": "overview", "fileId": None, "path": None,
        "title": f"Welcome to {repo_name}",
        "role": summary,
        "concept": "overview",
        "conceptTitle": "Reading a codebase like a map",
        "lesson": "A repo is easier to learn when you follow the flow — start at the "
                  "entry point, move to the core, then visit the risky corners. That's "
                  "the path this tour takes.",
        "metrics": [
            _metric("Files", str(len(code))),
            _metric("Lines", f"{repo.get('linesOfCode', 0):,}"),
            _metric("Avg risk", f"{repo.get('avgRiskScore', 0):.2f}",
                    _risk_tone(repo.get("avgRiskScore", 0))),
        ],
        "relatedFileIds": [],
    })

    # 1. Entry point — "the front door". (_entry_rank: lower is better → ascending)
    entry = pick(_entry_rank, reverse=False)
    if entry:
        stops.append({
            "id": "entrypoint", "fileId": entry["id"], "path": entry["path"],
            "title": "The front door",
            "role": f"`{entry['path']}` is where execution begins — the file that boots "
                    f"the app and hands control to everything else. Start here to see how "
                    f"the pieces connect.",
            "concept": "entrypoint",
            "conceptTitle": "Entry points should stay stable",
            "lesson": "A healthy entry point changes rarely — lots of churn here means the "
                      "app's wiring keeps shifting, which destabilizes everything downstream.",
            "metrics": _file_metrics(entry),
            "relatedFileIds": [],
        })

    # 2. Top hotspot — change × complexity.
    hotspot = pick(lambda f: f.get("hotspotScore", 0))
    if hotspot and hotspot.get("hotspotScore", 0) > 0:
        stops.append({
            "id": "hotspot", "fileId": hotspot["id"], "path": hotspot["path"],
            "title": "Meet the hotspot",
            "role": f"`{hotspot['path']}` is changed constantly *and* is hard to change — "
                    f"the combination that makes a file dangerous to touch.",
            "concept": "hotspot",
            "conceptTitle": "Hotspots: where churn meets complexity",
            "lesson": "Complexity alone is fine if nobody touches it; churn alone is fine "
                      "if the code is simple. A hotspot is both at once, so every edit is "
                      "risky and bugs cluster here. These are your highest-leverage refactors.",
            "metrics": _file_metrics(hotspot),
            "relatedFileIds": [],
        })

    # 3. Tightest coupling — files that always change together. Center on whichever
    # endpoint is still unused so this stop lands on a fresh file when it can.
    by_id = {f["id"]: f for f in code}
    for top in sorted(coupling, key=lambda c: c.get("coChanges", 0), reverse=True):
        center_id = top["fileAId"] if top["fileAId"] not in used else top["fileBId"]
        a = by_id.get(center_id)
        if not a or center_id in used:
            continue
        used.add(center_id)
        partner_id = top["fileBId"] if center_id == top["fileAId"] else top["fileAId"]
        stops.append({
            "id": "coupling", "fileId": a["id"], "path": a["path"],
            "title": "The invisible thread",
            "role": f"`{top['fileA']}` and `{top['fileB']}` have changed together "
                    f"{top['coChanges']} times. Editing one almost always means editing "
                    f"the other — even though nothing in the code says so.",
            "concept": "coupling",
            "conceptTitle": "Temporal coupling: hidden dependencies",
            "lesson": "When two files keep changing together, they share a hidden "
                      "dependency. Newcomers miss it and break one while fixing the "
                      "other. Spotting coupling tells you what to read — and test — together.",
            "metrics": [_metric("Co-changes", str(top["coChanges"]), "warn"),
                        _metric("Partner", top["fileB"] if center_id == top["fileAId"] else top["fileA"])],
            "relatedFileIds": [partner_id],
        })
        break

    # 4. Most complex file — complexity hides bugs.
    complex_f = pick(lambda f: f.get("complexity", 0))
    if complex_f and complex_f.get("complexity", 0) > 0:
        stops.append({
            "id": "complexity", "fileId": complex_f["id"], "path": complex_f["path"],
            "title": "The maze",
            "role": f"`{complex_f['path']}` has the deepest logic in the repo "
                    f"({complex_f.get('functionCount', 0)} functions, complexity "
                    f"{complex_f.get('complexity', 0)}). Lots of branches to hold in your head.",
            "concept": "complexity",
            "conceptTitle": "Complexity is where bugs hide",
            "lesson": "Each branch is a path a test must cover and a place a bug can hide. "
                      "High cyclomatic complexity correlates with defects — this is the kind "
                      "of file worth breaking into smaller, named pieces.",
            "metrics": _file_metrics(complex_f),
            "relatedFileIds": [],
        })

    # 5. Stable foundation — old but quiet.
    stable = pick(lambda f: f.get("ageDays", 0) - f.get("churnCommits", 0) * 5)
    if stable and stable.get("ageDays", 0) > 0:
        stops.append({
            "id": "stable", "fileId": stable["id"], "path": stable["path"],
            "title": "The bedrock",
            "role": f"`{stable['path']}` is old ({stable.get('ageDays', 0)} days) but barely "
                    f"changes. It's likely settled foundation — the kind of code you can "
                    f"trust and build on.",
            "concept": "stable",
            "conceptTitle": "Stable foundation, or forgotten code?",
            "lesson": "Old + untouched usually means 'solved and stable'. But check: low "
                      "coverage plus no changes can also mean code everyone's afraid to "
                      "touch. Age tells you which questions to ask, not the answer.",
            "metrics": _file_metrics(stable),
            "relatedFileIds": [],
        })

    # 6. Coverage gap — risk without a safety net (lowest coverage, then highest risk).
    gap = pick(
        lambda f: (f.get("testCoverage", 0), -f.get("riskScore", 0)),
        reverse=False,
        pred=lambda f: not _is_test(f["path"]),
    )
    if gap:
        stops.append({
            "id": "tests", "fileId": gap["id"], "path": gap["path"],
            "title": "Without a net",
            "role": f"`{gap['path']}` carries real risk but only "
                    f"{gap.get('testCoverage', 0)}% test coverage — changes here aren't "
                    f"caught by the test suite.",
            "concept": "tests",
            "conceptTitle": "Risk × low coverage = fragile",
            "lesson": "Risk you can't detect is the worst kind. A risky file with thin tests "
                      "is where regressions slip through. Adding tests here buys the most "
                      "safety per line written.",
            "metrics": _file_metrics(gap),
            "relatedFileIds": [],
        })

    # Debt tour ordering: file-backed stops by descending risk; overview last.
    def stop_risk(s: Dict) -> float:
        f = next((x for x in code if x["id"] == s.get("fileId")), None)
        return f.get("riskScore", 0.0) if f else -1.0

    debt_order = [s["id"] for s in sorted(stops, key=stop_risk, reverse=True)]

    return {
        "repoId": repo["id"],
        "kind": "debt",
        "generated": False,
        "model": "heuristic",
        "summary": summary,
        "stops": stops,
        "debtOrder": debt_order,
    }


def build_code_walkthrough(repo: Dict, files: List[Dict]) -> Dict:
    """A "how the code works" tour: entry point → core logic → data → interface →
    building blocks → helpers. Explains the codebase as code, not as debt metrics.
    Same RepoTour shape; AI enrichment authors the functional prose."""
    non_dir = [f for f in files if not f.get("isDirectory")]
    code = [f for f in non_dir if _is_code(f.get("path", ""))] or non_dir
    repo_name = repo.get("name", "this repository")

    summary = (
        f"{repo_name} has {len(code)} source files. This walkthrough explains how the "
        f"codebase is organized and what its main parts do — where the app starts, the "
        f"core logic, how data is modeled, and how the layers connect."
    )

    if not code:
        return {
            "repoId": repo["id"], "kind": "code", "generated": False, "model": "heuristic",
            "summary": summary,
            "stops": [{
                "id": "overview", "fileId": None, "path": None,
                "title": f"Inside {repo_name}",
                "role": "This repository hasn't been analyzed into files yet, so there's "
                        "nothing to walk through. Run an analysis to unlock the tour.",
                "concept": "overview", "conceptTitle": "The big picture",
                "lesson": "Once analyzed, this tour follows the code from the entry point "
                          "inward through the core, data, and interface layers.",
                "metrics": [], "relatedFileIds": [],
            }],
            "debtOrder": [],
        }

    used: set = set()

    def pick(key, reverse: bool = True, pred=None) -> Optional[Dict]:
        cands = [f for f in code if f["id"] not in used and (pred(f) if pred else True)]
        if not cands:
            return None
        chosen = sorted(cands, key=key, reverse=reverse)[0]
        used.add(chosen["id"])
        return chosen

    def facts(f: Dict) -> List[Dict]:
        return [
            _metric("Language", _lang(f["path"])),
            _metric("Lines", str(f.get("linesOfCode", 0))),
            _metric("Functions", str(f.get("functionCount", 0))),
        ]

    stops: List[Dict] = [{
        "id": "overview", "fileId": None, "path": None,
        "title": f"Inside {repo_name}",
        "role": summary,
        "concept": "overview", "conceptTitle": "The big picture",
        "lesson": "Follow the tour from the entry point inward: what boots the app, where "
                  "the core logic lives, how data is shaped, and how the pieces talk to "
                  "each other.",
        "metrics": [_metric("Files", str(len(code))),
                    _metric("Lines", f"{repo.get('linesOfCode', 0):,}")],
        "relatedFileIds": [],
    }]

    # Entry point — where execution begins.
    entry = pick(_entry_rank, reverse=False)
    if entry:
        stops.append({
            "id": "entrypoint", "fileId": entry["id"], "path": entry["path"],
            "title": "Where it starts",
            "role": f"`{entry['path']}` is the entry point — the first code that runs and "
                    f"the file that wires the rest of the app together.",
            "concept": "entrypoint", "conceptTitle": "Where execution begins",
            "lesson": "Trace from here to see how the program boots and which modules it "
                      "pulls in first.",
            "metrics": facts(entry), "relatedFileIds": [],
        })

    # Core — the implementation file with the most logic (skip tests/examples).
    core = pick(lambda f: f.get("functionCount", 0),
                pred=lambda f: not _is_aux(f["path"]))
    if core and core.get("functionCount", 0) > 0:
        stops.append({
            "id": "core", "fileId": core["id"], "path": core["path"],
            "title": "The core",
            "role": f"`{core['path']}` carries the most logic in the repo "
                    f"({core.get('functionCount', 0)} functions) — effectively the engine "
                    f"that the rest of the app builds on.",
            "concept": "core", "conceptTitle": "The central logic",
            "lesson": "Most features route through here; understanding this file unlocks "
                      "most of the codebase.",
            "metrics": facts(core), "relatedFileIds": [],
        })

    # Data layer — models / schemas / types.
    data = pick(lambda f: f.get("linesOfCode", 0),
                pred=lambda f: not _is_aux(f["path"]) and _matches(f["path"], ("model", "schema", "entit", "types", "dto", "dataclass")))
    if data:
        stops.append({
            "id": "data", "fileId": data["id"], "path": data["path"],
            "title": "The data shapes",
            "role": f"`{data['path']}` defines the data the app works with — the models, "
                    f"schemas, or types that everything else reads and writes.",
            "concept": "data", "conceptTitle": "Data & types",
            "lesson": "These shapes are the vocabulary of the codebase; the core and "
                      "interface layers both speak in terms of them.",
            "metrics": facts(data), "relatedFileIds": [],
        })

    # Interface — routes / API / views / handlers.
    api = pick(lambda f: f.get("linesOfCode", 0),
               pred=lambda f: not _is_aux(f["path"]) and _matches(f["path"], ("route", "/api", "views", "controller", "endpoint", "handler", "urls", "resolver")))
    if api:
        stops.append({
            "id": "api", "fileId": api["id"], "path": api["path"],
            "title": "The outside edge",
            "role": f"`{api['path']}` is where the app meets the outside world — the "
                    f"routes/handlers that turn requests into calls on the core logic.",
            "concept": "api", "conceptTitle": "The interface layer",
            "lesson": "This is the seam between users (or other systems) and the internals "
                      "— a good place to see the app's capabilities end to end.",
            "metrics": facts(api), "relatedFileIds": [],
        })

    # Building blocks — largest remaining files in distinct directories.
    module_n = 0
    seen_dirs: set = set()
    for f in sorted((x for x in code if x["id"] not in used and not _is_aux(x["path"])),
                    key=lambda x: x.get("linesOfCode", 0), reverse=True):
        d = f["path"].rsplit("/", 1)[0] if "/" in f["path"] else ""
        if d in seen_dirs:
            continue
        seen_dirs.add(d)
        used.add(f["id"])
        module_n += 1
        stops.append({
            "id": f"module-{module_n}", "fileId": f["id"], "path": f["path"],
            "title": "A building block",
            "role": f"`{f['path']}` is one of the larger modules in the codebase, a "
                    f"distinct chunk of functionality worth knowing.",
            "concept": "module", "conceptTitle": "A functional area",
            "lesson": "Modules like this are the units you'll work in day to day; this one "
                      "owns a meaningful slice of the app.",
            "metrics": facts(f), "relatedFileIds": [],
        })
        if module_n >= 2:
            break

    # Shared helpers.
    util = pick(lambda f: f.get("linesOfCode", 0),
                pred=lambda f: not _is_aux(f["path"]) and _matches(f["path"], ("util", "helper", "/lib", "common", "shared")))
    if util:
        stops.append({
            "id": "utility", "fileId": util["id"], "path": util["path"],
            "title": "The toolbox",
            "role": f"`{util['path']}` collects shared helpers reused across the codebase "
                    f"— small functions many other files lean on.",
            "concept": "utility", "conceptTitle": "Shared helpers",
            "lesson": "Helper modules reveal the codebase's common patterns; you'll import "
                      "from here constantly.",
            "metrics": facts(util), "relatedFileIds": [],
        })

    return {
        "repoId": repo["id"], "kind": "code", "generated": False, "model": "heuristic",
        "summary": summary, "stops": stops, "debtOrder": [],
    }


def enrich_with_ai(tour: Dict, repository: Dict, repo_path: Optional[str],
                   kind: str = "debt") -> Dict:
    """Overlay Claude-authored prose (title/role/lesson + summary) onto a heuristic
    tour, grounded in each file's real source. Keeps the deterministic selection,
    metrics, and ordering. Raises on AI/auth errors so the route can fall back."""
    from app.services import ai_analysis

    authored = ai_analysis.author_tour(repository, tour["stops"], repo_path, kind=kind)
    by_id = {a.id: a for a in authored.stops}
    for s in tour["stops"]:
        a = by_id.get(s["id"])
        if a:
            s["title"], s["role"], s["lesson"] = a.title, a.role, a.lesson
    if authored.summary:
        tour["summary"] = authored.summary
        # The overview stop's body mirrors the summary — keep them in sync.
        for s in tour["stops"]:
            if s["id"] == "overview":
                s["role"] = authored.summary
                break
    tour["generated"] = True
    tour["model"] = ai_analysis._MODEL
    return tour
