import subprocess
from typing import Dict, List, Tuple
from app.services.file_metrics import build_basic_file_metrics

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
    
def get_basic_repository_metrics(repo_path: str) -> Tuple[bool, str, List[Dict]]:
    success, message, files = get_tracked_files(repo_path)

    if not success:
        return False, message, []

    churn_success, churn_message, churn_map = get_file_churn(repo_path)

    if not churn_success:
        return False, churn_message, []

    metrics = []

    for file_path in files:
        file_metrics = build_basic_file_metrics(repo_path, file_path)
        file_metrics["churn"] = churn_map.get(file_path, 0)
        metrics.append(file_metrics)

    return True, "Basic repository metrics with churn extracted successfully.", metrics