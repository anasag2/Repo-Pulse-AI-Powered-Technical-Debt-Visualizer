import subprocess
from typing import List, Tuple

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