import re
import subprocess
import time
from itertools import combinations
from typing import Dict, List, Tuple
from app.services.file_metrics import build_basic_file_metrics

# Field separator used inside the git log pretty-format. ASCII unit separator
# is safe because it never appears in author names or commit subjects.
_GIT_LOG_SEP = "\x1f"

# Commit subjects that signal a bug fix — used for defect-density per file.
_BUGFIX_RE = re.compile(
    r"\b(fix|fixes|fixed|bug|bugfix|hotfix|patch|revert|regression|defect|broken|crash)\b",
    re.IGNORECASE,
)


def get_recent_commits(repo_path: str, limit: int = 30) -> Tuple[bool, str, List[Dict]]:
    """
    Returns the most recent commits for a repository, newest first.

    Each commit is a dict with: hash (short), author, time_ago (relative,
    e.g. "3 days ago") and message (subject line).
    """
    pretty = _GIT_LOG_SEP.join(["%h", "%an", "%ar", "%s"])
    try:
        result = subprocess.run(
            [
                "git",
                "-C",
                repo_path,
                "log",
                f"-n{limit}",
                f"--pretty=format:{pretty}",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True,
        )

        commits: List[Dict] = []
        for line in result.stdout.splitlines():
            if not line.strip():
                continue
            parts = line.split(_GIT_LOG_SEP)
            if len(parts) != 4:
                continue
            short_hash, author, time_ago, message = parts
            commits.append(
                {
                    "hash": short_hash.strip(),
                    "author": author.strip(),
                    "time_ago": time_ago.strip(),
                    "message": message.strip(),
                }
            )

        return True, "Recent commits extracted successfully.", commits
    except subprocess.CalledProcessError as e:
        error_message = e.stderr.strip() if e.stderr else "An error occurred while extracting commits."
        return False, error_message, []

def get_tracked_files(repo_path: str) -> Tuple[bool, str, List[str]]:
    """
    Returns all files tracked by Git in the given repository
    """
    try:
        result = subprocess.run(
            ["git", "-C", repo_path, "ls-files"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True
        )

        files = [
            line.strip()
            for line in result.stdout.splitlines()
            if line.strip()
        ]

        return True, "Tracked files extracted successfully.",files
    except subprocess.CalledProcessError as e:
        error_message = e.stderr.strip() if e.stderr else "An error occurred while extracting tracked files."
        return False, error_message, []
    
def get_file_churn(repo_path: str) -> Tuple[bool, str, dict]:
    """
    Calculates churn as the number of commits that touched each file.
    """
    try:
        result = subprocess.run(
            ["git", "-C", repo_path, "log", "--name-only", "--pretty=format:"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True
        )

        churn = {}

        for line in result.stdout.splitlines():
            file_path = line.strip()

            if not file_path:
                continue

            churn[file_path] = churn.get(file_path, 0) + 1

        return True, "File churn extracted successfully.", churn
    except subprocess.CalledProcessError as e:
        error_message = e.stderr.strip() if e.stderr else "An error occurred while extracting file churn."
        return False, error_message, {}

def get_file_ownership(repo_path: str) -> Tuple[bool, str, Dict[str, Dict]]:
    """
    Calculates file ownership as the percentage of commits made by each author for each file.
    """
    try:
        result = subprocess.run(
            [
                "git",
                "-C",
                repo_path,
                "log",
                "--name-only",
                "--pretty=format:AUTHOR:%an"
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True
        )

        ownership_raw = {}
        current_auther = None
        files_seen_in_current_commit = set()

        for line in result.stdout.splitlines():
            line = line.strip()

            if not line:
                continue

            if line.startswith("AUTHOR:"):
                current_auther = line.replace("AUTHOR:", "").strip()
                files_seen_in_current_commit = set()
                continue

            if current_auther is None:
                continue

            file_path = line

            # Avoid counting the same file twice in the same commit
            if file_path in files_seen_in_current_commit:
                continue
            
            files_seen_in_current_commit.add(file_path)

            if file_path not in ownership_raw:
                ownership_raw[file_path] = {}

            ownership_raw[file_path][current_auther] = (
                ownership_raw[file_path].get(current_auther, 0) + 1
            )


        ownership_summary = {}

        for file_path, authors in ownership_raw.items():
            total_commits = sum(authors.values())

            if total_commits == 0:
                continue

            main_author = max(authors, key=authors.get)
            main_author_commits = authors[main_author]
            main_author_share = main_author_commits / total_commits

            ownership_summary[file_path] = {
                "contributors_count": len(authors),
                "main_contributor": main_author,
                "main_contributor_commits": main_author_commits,
                "main_contributor_share": round(main_author_share, 3),
                "contributors": authors
            }

        return True, "File ownership calculated successfully.", ownership_summary

    except subprocess.CalledProcessError as e:
        error_message = e.stderr.strip() if e.stderr else "Failed to calculate file ownership."
        return False, error_message, {}
    
def get_file_commit_stats(repo_path: str) -> Tuple[bool, str, Dict[str, Dict]]:
    """
    Single history pass that derives three per-file signals at once:
      - churn:        number of commits that touched the file
      - last_age_days: days since the file was last committed (recency)
      - bug_commits:  commits whose subject looks like a bug fix

    One `git log` instead of three separate passes.
    """
    pretty = "__C__" + _GIT_LOG_SEP.join(["%ct", "%s"])
    try:
        result = subprocess.run(
            ["git", "-C", repo_path, "log", "--name-only", f"--pretty=format:{pretty}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True,
        )
    except subprocess.CalledProcessError as e:
        return False, (e.stderr.strip() or "Failed to read commit history."), {}

    stats: Dict[str, Dict] = {}
    now = time.time()
    commit_ts = 0.0
    is_bugfix = False

    for line in result.stdout.splitlines():
        if line.startswith("__C__"):
            payload = line[len("__C__"):]
            ts_str, _, subject = payload.partition(_GIT_LOG_SEP)
            try:
                commit_ts = float(ts_str)
            except ValueError:
                commit_ts = 0.0
            is_bugfix = bool(_BUGFIX_RE.search(subject))
            continue

        path = line.strip()
        if not path:
            continue

        entry = stats.get(path)
        if entry is None:
            # First (newest) sighting -> this is the most recent commit for the file.
            entry = {
                "churn": 0,
                "last_age_days": int((now - commit_ts) / 86400) if commit_ts else 0,
                "bug_commits": 0,
            }
            stats[path] = entry
        entry["churn"] += 1
        if is_bugfix:
            entry["bug_commits"] += 1

    return True, "Per-file commit stats extracted successfully.", stats


def get_temporal_coupling(
    repo_path: str,
    min_support: int = 3,
    min_degree: float = 0.45,
    max_files_per_commit: int = 40,
    limit: int = 50,
) -> Tuple[bool, str, List[Dict]]:
    """
    Temporal (logical) coupling: files that repeatedly change together.

    For every commit we take the set of touched files and count co-change for
    each pair. Coupling degree = co_changes / min(commits(a), commits(b)) — i.e.
    "when the rarer of the two changes, how often does the other change too".

    Bulk commits touching more than `max_files_per_commit` files are skipped
    (they are usually formatting/license/merge sweeps and would create spurious
    coupling across the whole repo, plus an O(n^2) blow-up).

    Returns the strongest pairs, sorted by degree then support.
    """
    try:
        result = subprocess.run(
            ["git", "-C", repo_path, "log", "--name-only", "--pretty=format:__C__"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True,
        )
    except subprocess.CalledProcessError as e:
        return False, (e.stderr.strip() or "Failed to read commit history."), []

    file_commits: Dict[str, int] = {}
    pair_counts: Dict[Tuple[str, str], int] = {}

    current: List[str] = []

    def flush(group: List[str]) -> None:
        if not (2 <= len(group) <= max_files_per_commit):
            for f in group:
                file_commits[f] = file_commits.get(f, 0) + 1
            return
        for f in group:
            file_commits[f] = file_commits.get(f, 0) + 1
        for a, b in combinations(sorted(group), 2):
            pair_counts[(a, b)] = pair_counts.get((a, b), 0) + 1

    for line in result.stdout.splitlines():
        if line.startswith("__C__"):
            flush(current)
            current = []
            continue
        path = line.strip()
        if path:
            current.append(path)
    flush(current)

    pairs: List[Dict] = []
    for (a, b), support in pair_counts.items():
        if support < min_support:
            continue
        denom = min(file_commits.get(a, 1), file_commits.get(b, 1)) or 1
        degree = support / denom
        if degree < min_degree:
            continue
        pairs.append(
            {"fileA": a, "fileB": b, "coChanges": support, "degree": round(degree, 2)}
        )

    # Support (how often they co-change) first, then strength. This keeps a long
    # tail of one-off co-additions (e.g. boilerplate config added together) from
    # burying genuinely entangled source files.
    pairs.sort(key=lambda p: (p["coChanges"], p["degree"]), reverse=True)
    return True, "Temporal coupling computed successfully.", pairs[:limit]


def get_basic_repository_metrics(repo_path: str) -> Tuple[bool, str, List[Dict]]:
    success, message, files = get_tracked_files(repo_path)

    if not success:
        return False, message, []

    stats_success, stats_message, commit_stats = get_file_commit_stats(repo_path)

    if not stats_success:
        return False, stats_message, []

    ownership_success, ownership_message, ownership_map = get_file_ownership(repo_path)

    if not ownership_success:
        return False, ownership_message, []

    metrics = []

    for file_path in files:
        file_metrics = build_basic_file_metrics(repo_path, file_path)

        stat = commit_stats.get(file_path, {"churn": 0, "last_age_days": 0, "bug_commits": 0})
        file_metrics["churn"] = stat["churn"]
        file_metrics["last_age_days"] = stat["last_age_days"]
        file_metrics["bug_commits"] = stat["bug_commits"]

        ownership = ownership_map.get(file_path, {
            "contributors_count": 0,
            "main_contributor": None,
            "main_contributor_commits": 0,
            "main_contributor_share": 0,
            "contributors": {}
        })

        file_metrics["ownership"] = ownership

        metrics.append(file_metrics)

    return True, "Repository metrics with churn, recency, defect and ownership extracted successfully.", metrics