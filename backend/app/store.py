"""
MongoDB-backed store for analyzed repositories.

Replaces the old in-memory dict store — analyses now survive a restart and the
same code works against a local mongod (dev) or MongoDB Atlas (prod) via the
MONGODB_URI env var (see app/db.py). The public method signatures are unchanged,
so the route handlers don't need to know which backend is underneath.

Collections:
  repositories  one doc per repo (the Repository payload + a private `localPath`)
  files         one doc per file (FileNode fields + embedded riskFactors/recentCommits)
  commits       one doc per commit
  coupling      one doc per temporal-coupling pair
  counters      auto-increment sequences so repo/file/commit ids stay integers
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

from pymongo import ASCENDING, ReturnDocument

from app.db import db

# Hide Mongo's _id and the private clone path from API responses.
_API_PROJECTION = {"_id": 0, "localPath": 0}
_FILE_LIST_PROJECTION = {"_id": 0, "riskFactors": 0, "recentCommits": 0}


class RepoStore:
    def __init__(self) -> None:
        self._repositories = db["repositories"]
        self._files = db["files"]
        self._commits = db["commits"]
        self._coupling = db["coupling"]
        self._counters = db["counters"]
        self._users = db["users"]
        self._settings = db["user_settings"]
        self._ensure_indexes()

    def _ensure_indexes(self) -> None:
        self._repositories.create_index([("id", ASCENDING)], unique=True)
        self._repositories.create_index([("ownerId", ASCENDING)])
        self._files.create_index([("repoId", ASCENDING), ("id", ASCENDING)])
        self._commits.create_index([("repoId", ASCENDING)])
        self._coupling.create_index([("repoId", ASCENDING)])
        self._users.create_index([("email", ASCENDING)], unique=True)
        self._users.create_index([("id", ASCENDING)], unique=True)
        self._settings.create_index([("userId", ASCENDING)], unique=True)

    # -- id allocation -----------------------------------------------------
    def _next_seq(self, name: str) -> int:
        doc = self._counters.find_one_and_update(
            {"_id": name},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return doc["seq"]

    def _peek_seq(self, name: str) -> int:
        doc = self._counters.find_one({"_id": name})
        return (doc["seq"] if doc else 0) + 1

    def reserve_repo_id(self) -> int:
        return self._next_seq("repo")

    def peek_file_id(self) -> int:
        return self._peek_seq("file")

    def peek_commit_id(self) -> int:
        return self._peek_seq("commit")

    def _bump_to(self, name: str, last_id: int) -> None:
        # Advance the counter so the next peek starts after this block of ids.
        self._counters.update_one(
            {"_id": name}, {"$max": {"seq": last_id}}, upsert=True
        )

    # -- writes ------------------------------------------------------------
    def save_analysis(self, repo_id: int, payload: Dict,
                      local_path: Optional[str] = None,
                      owner_id: Optional[int] = None) -> None:
        repository = dict(payload["repository"])
        if local_path:
            repository["localPath"] = local_path
        if owner_id is not None:
            repository["ownerId"] = owner_id
        self._repositories.replace_one({"id": repo_id}, repository, upsert=True)

        # Re-insert this repo's child docs from scratch.
        self._files.delete_many({"repoId": repo_id})
        self._commits.delete_many({"repoId": repo_id})
        self._coupling.delete_many({"repoId": repo_id})

        extras = payload.get("file_extras", {})
        files = payload["files"]
        if files:
            self._files.insert_many(
                {**f, **extras.get(f["id"], {})} for f in files
            )
            self._bump_to("file", max(f["id"] for f in files))

        commits = payload["commits"]
        if commits:
            self._commits.insert_many(dict(c) for c in commits)
            self._bump_to("commit", max(c["id"] for c in commits))

        coupling = payload.get("coupling", [])
        if coupling:
            self._coupling.insert_many({**c, "repoId": repo_id} for c in coupling)

    def delete_repository(self, repo_id: int) -> Optional[str]:
        """Remove a repository. Returns its local clone path (for cleanup) or None."""
        repo = self._repositories.find_one({"id": repo_id})
        if repo is None:
            return None
        self._repositories.delete_one({"id": repo_id})
        self._files.delete_many({"repoId": repo_id})
        self._commits.delete_many({"repoId": repo_id})
        self._coupling.delete_many({"repoId": repo_id})
        return repo.get("localPath")

    # -- reads -------------------------------------------------------------
    def list_repositories(self, owner_id: Optional[int] = None) -> List[Dict]:
        query = {} if owner_id is None else {"ownerId": owner_id}
        return list(self._repositories.find(query, _API_PROJECTION))

    def get_repository(self, repo_id: int,
                       owner_id: Optional[int] = None) -> Optional[Dict]:
        query = {"id": repo_id}
        if owner_id is not None:
            query["ownerId"] = owner_id
        return self._repositories.find_one(query, _API_PROJECTION)

    def _repo_exists(self, repo_id: int) -> bool:
        return self._repositories.find_one({"id": repo_id}, {"_id": 1}) is not None

    def list_files(self, repo_id: int) -> Optional[List[Dict]]:
        if not self._repo_exists(repo_id):
            return None
        return list(self._files.find({"repoId": repo_id}, _FILE_LIST_PROJECTION))

    def get_file(self, repo_id: int, file_id: int) -> Optional[Dict]:
        return self._files.find_one(
            {"repoId": repo_id, "id": file_id}, {"_id": 0}
        )

    def list_commits(self, repo_id: int) -> Optional[List[Dict]]:
        if not self._repo_exists(repo_id):
            return None
        return list(self._commits.find({"repoId": repo_id}, {"_id": 0}))

    def list_coupling(self, repo_id: int) -> Optional[List[Dict]]:
        if not self._repo_exists(repo_id):
            return None
        return list(self._coupling.find({"repoId": repo_id}, {"_id": 0}))

    def get_repo_path(self, repo_id: int) -> Optional[str]:
        repo = self._repositories.find_one({"id": repo_id}, {"localPath": 1})
        return repo.get("localPath") if repo else None

    # -- users -------------------------------------------------------------
    def create_user(self, email: str, name: str, password_hash: str) -> Dict:
        """Insert a new user. Raises pymongo.errors.DuplicateKeyError if email taken."""
        user = {
            "id": self._next_seq("user"),
            "email": email,
            "name": name,
            "passwordHash": password_hash,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        self._users.insert_one(user)
        return user

    def get_user_by_email(self, email: str) -> Optional[Dict]:
        return self._users.find_one({"email": email}, {"_id": 0})

    def get_user_by_id(self, user_id: int) -> Optional[Dict]:
        return self._users.find_one({"id": user_id}, {"_id": 0})

    # -- per-user settings -------------------------------------------------
    def get_settings(self, user_id: int) -> Dict:
        doc = self._settings.find_one({"userId": user_id}, {"_id": 0, "userId": 0})
        return doc or {}

    def save_settings(self, user_id: int, settings: Dict) -> Dict:
        self._settings.update_one(
            {"userId": user_id},
            {"$set": {**settings, "userId": user_id}},
            upsert=True,
        )
        return self.get_settings(user_id)


store = RepoStore()
