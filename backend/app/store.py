"""
In-memory store for analyzed repositories.

This keeps the API stateless-server-friendly for a demo: everything lives in
process memory and resets on restart. Swap this module for a real database
later without touching the route handlers.
"""
from __future__ import annotations

import threading
from typing import Dict, List, Optional


class RepoStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._repositories: Dict[int, Dict] = {}
        self._files: Dict[int, List[Dict]] = {}          # repoId -> [FileNode]
        self._file_extras: Dict[int, Dict[int, Dict]] = {}  # repoId -> fileId -> extras
        self._commits: Dict[int, List[Dict]] = {}        # repoId -> [Commit]
        self._repo_paths: Dict[int, str] = {}            # repoId -> local clone path
        self._next_repo_id = 1
        self._next_file_id = 1
        self._next_commit_id = 1

    # -- id allocation -----------------------------------------------------
    def reserve_repo_id(self) -> int:
        with self._lock:
            rid = self._next_repo_id
            self._next_repo_id += 1
            return rid

    def peek_file_id(self) -> int:
        return self._next_file_id

    def peek_commit_id(self) -> int:
        return self._next_commit_id

    # -- writes ------------------------------------------------------------
    def save_analysis(self, repo_id: int, payload: Dict,
                      local_path: Optional[str] = None) -> None:
        with self._lock:
            self._repositories[repo_id] = payload["repository"]
            if local_path:
                self._repo_paths[repo_id] = local_path
            files = payload["files"]
            self._files[repo_id] = files
            self._file_extras[repo_id] = payload["file_extras"]
            self._commits[repo_id] = payload["commits"]
            if files:
                self._next_file_id = max(f["id"] for f in files) + 1
            commits = payload["commits"]
            if commits:
                self._next_commit_id = max(c["id"] for c in commits) + 1

    def delete_repository(self, repo_id: int) -> Optional[str]:
        """Remove a repository. Returns its local clone path (for cleanup) or None."""
        with self._lock:
            if repo_id not in self._repositories:
                return None
            self._repositories.pop(repo_id, None)
            self._files.pop(repo_id, None)
            self._file_extras.pop(repo_id, None)
            self._commits.pop(repo_id, None)
            return self._repo_paths.pop(repo_id, None)

    # -- reads -------------------------------------------------------------
    def list_repositories(self) -> List[Dict]:
        return list(self._repositories.values())

    def get_repository(self, repo_id: int) -> Optional[Dict]:
        return self._repositories.get(repo_id)

    def list_files(self, repo_id: int) -> Optional[List[Dict]]:
        return self._files.get(repo_id)

    def get_file(self, repo_id: int, file_id: int) -> Optional[Dict]:
        for node in self._files.get(repo_id, []):
            if node["id"] == file_id:
                extras = self._file_extras.get(repo_id, {}).get(file_id, {})
                return {**node, **extras}
        return None

    def list_commits(self, repo_id: int) -> Optional[List[Dict]]:
        return self._commits.get(repo_id)


store = RepoStore()
