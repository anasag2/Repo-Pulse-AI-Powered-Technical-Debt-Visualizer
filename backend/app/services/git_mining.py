import subprocess
from typing import Dict, List, Tuple
from app.services.file_metrics import build_basic_file_metrics

# Field separator used inside the git log pretty-format. ASCII unit separator
# is safe because it never appears in author names or commit subjects.
_GIT_LOG_SEP = "\x1f"


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
    
def get_basic_repository_metrics(repo_path: str) -> Tuple[bool, str, List[Dict]]:
    success, message, files = get_tracked_files(repo_path)

    if not success:
        return False, message, []

    churn_success, churn_message, churn_map = get_file_churn(repo_path)

    if not churn_success:
        return False, churn_message, []

    ownership_success, ownership_message, ownership_map = get_file_ownership(repo_path)

    if not ownership_success:
        return False, ownership_message, []

    metrics = []

    for file_path in files:
        file_metrics = build_basic_file_metrics(repo_path, file_path)

        file_metrics["churn"] = churn_map.get(file_path, 0)

        ownership = ownership_map.get(file_path, {
            "contributors_count": 0,
            "main_contributor": None,
            "main_contributor_commits": 0,
            "main_contributor_share": 0,
            "contributors": {}
        })

        file_metrics["ownership"] = ownership

        metrics.append(file_metrics)

    return True, "Repository metrics with churn and ownership extracted successfully.", metrics