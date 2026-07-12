from pathlib import Path
import os
import subprocess
import time
import uuid
import shutil
from typing import Optional

WORKSPACE_DIR = Path("workspaces")

def prepare_workspace() -> None:
    WORKSPACE_DIR.mkdir(exist_ok=True)


def touch_clone(local_path: Optional[str]) -> None:
    """Mark a clone as recently used (for LRU eviction). Cheap and best-effort."""
    if not local_path:
        return
    p = Path(local_path)
    if p.exists():
        try:
            os.utime(p, None)
        except OSError:
            pass


def update_remote_repository(local_path: Optional[str], url: str) -> tuple[bool, str, Optional[str]]:
    """Refresh an existing shallow clone by fetching ONLY the new commits, then
    hard-resetting to the latest. If the clone is missing (e.g. evicted) or broken,
    fall back to a fresh clone. Returns (ok, message, path)."""
    if local_path and (Path(local_path) / ".git").exists():
        try:
            subprocess.run(
                ["git", "-C", local_path, "fetch", "--depth", "300", "--no-tags", "origin"],
                capture_output=True, text=True, check=True, timeout=300,
            )
            subprocess.run(
                ["git", "-C", local_path, "reset", "--hard", "@{u}"],
                capture_output=True, text=True, check=True, timeout=120,
            )
            touch_clone(local_path)
            return True, "Fetched latest changes.", local_path
        except subprocess.TimeoutExpired:
            return False, "Fetch timed out. Try again later.", None
        except subprocess.CalledProcessError:
            # Broken/conflicted clone — drop it and re-clone cleanly below.
            shutil.rmtree(local_path, ignore_errors=True)

    # Missing or unusable clone → fresh shallow clone.
    return clone_remote_repository(url)


def evict_stale_clones(ttl_days: float = 7.0) -> int:
    """Delete workspace clones not used within `ttl_days` (by directory mtime,
    which `touch_clone` keeps current on access). Lazy housekeeping — called as a
    background task after analyze/refresh, so no separate scheduler is needed.
    Returns the number of clones removed."""
    if not WORKSPACE_DIR.exists():
        return 0
    cutoff = time.time() - ttl_days * 86400
    removed = 0
    for child in WORKSPACE_DIR.iterdir():
        try:
            if child.is_dir() and child.stat().st_mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
                removed += 1
        except OSError:
            pass
    return removed

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
                # SECURITY: `url` is user-supplied. Disable git's dangerous transports
                # so a crafted URL can't run commands or read local files:
                #   ext::  -> arbitrary command execution (RCE)
                #   file:// -> clone/read local repos on the server (info disclosure)
                # These must come before the `clone` subcommand to take effect.
                "-c", "protocol.ext.allow=never",
                "-c", "protocol.file.allow=never",
                "clone",
                # Shallow + single branch + no tags keeps even very large repos
                # (e.g. kubernetes) to a feasible download. Depth 300 still gives
                # the history-based metrics (churn, coupling, ownership) a useful
                # window; the commit view only needs the latest 30.
                "--depth",
                "300",
                "--single-branch",
                "--no-tags",
                # `--` ends option parsing so a URL beginning with `-` can't be
                # smuggled in as a git flag (argument injection).
                "--",
                url,
                str(target_path)
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=300
        )

        return True, "Remote repository cloned successfully.", str(target_path)

    except subprocess.TimeoutExpired:
        if target_path.exists():
            shutil.rmtree(target_path, ignore_errors=True)

        return False, "Cloning timed out. The repository may be too large or the connection is too slow.", None
    
    except subprocess.CalledProcessError as e:
        if target_path.exists():
            shutil.rmtree(target_path, ignore_errors=True)

        error_message = e.stderr.strip() if e.stderr else "An error occurred during cloning."
        return False, f"Failed to clone remote repository: {error_message}", None