from pathlib import Path
import subprocess

def path_exists(path: str) -> bool:
    return Path(path).exists()

def is_directory(path: str) -> bool:
    return Path(path).is_dir()

def is_git_repository(path: str) -> bool:
    try:
        result = subprocess.run(
            ["git", "-C", path, "rev-parse", "--is-inside-work-tree"],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip() == "true"
    except subprocess.CalledProcessError:
        return False
    
def validate_local_repository(path: str) -> tuple[bool, str]:
    if not path_exists(path):
        return False, "Path does not exist."
    
    if not is_directory(path):
        return False, "Path is not a directory."
    
    if not is_git_repository(path):
        return False, "Path is not a valid Git repository."
    
    return True, "Valid local repository."