from pathlib import Path
import subprocess
import uuid
import shutil
from typing import Optional

WORKSPACE_DIR = Path("workspaces")

def prepare_workspace() -> None:
    WORKSPACE_DIR.mkdir(exist_ok=True)

def clone_remote_repository(url: str) -> tuple[bool, str, Optional[str]]:
    """
    Clone a public remote Git repository into the backend workspaces folder.
    Returns:
        A tuple containing:
        - A boolean indicating success or failure of the cloning operation.
        - A message providing details about the operation's outcome.
        - The path to the cloned repository if successful, otherwise None.
    """
    prepare_workspace()

    repo_id = str(uuid.uuid4())
    target_path = WORKSPACE_DIR / repo_id

    try:
        subprocess.run(
            [
                "git",
                "clone",
                "--depth",
                "1000",
                url,
                str(target_path)
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=180
        )

        return True, "Remote repository cloned successfully.", str(target_path)
    
    except subprocess.TimeoutExpired:
        if target_path.exists():
            shutil.rmtree(target_path, ignore_errors=True)

        return False, "Cloning timed out. The repository may be too large or the connection is slow>", None
    
    except subprocess.CalledProcessError as e:
        if target_path.exists():
            shutil.rmtree(target_path, ignore_errors=True)

        error_message = e.stderr.strip() if e.stderr else "An error occurred during cloning."
        return False, f"Failed to clone remote repository: {error_message}", None