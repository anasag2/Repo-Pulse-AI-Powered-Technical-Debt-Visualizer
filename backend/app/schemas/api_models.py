"""
Pydantic response models that mirror the frontend's OpenAPI contract
(lib/api-spec/openapi.yaml). Field names are intentionally camelCase to match
exactly what the generated `@workspace/api-client-react` client expects.
"""
from __future__ import annotations

import re
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


def _check_password_strength(v: str) -> str:
    """8+ chars (enforced via Field) AND ≥3 of: lowercase, uppercase, number, symbol."""
    categories = sum(
        bool(re.search(pat, v)) for pat in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]")
    )
    if categories < 3:
        raise ValueError(
            "Password must include at least 3 of: lowercase, uppercase, number, symbol"
        )
    return v


class HealthStatus(BaseModel):
    status: str


class Repository(BaseModel):
    id: int
    name: str
    url: str
    isPublic: bool
    lastAnalyzed: str
    totalFiles: int
    linesOfCode: int
    riskyFiles: int
    riskyFilesPercent: float
    authors: int
    lastCommit: str
    avgRiskScore: float
    testCoverage: int
    technicalDebt: str


class RepositoryInput(BaseModel):
    name: str
    url: str
    isPublic: Optional[bool] = True


class FileNode(BaseModel):
    id: int
    repoId: int
    name: str
    path: str
    parentPath: str
    isDirectory: bool
    riskScore: float
    churnCommits: int
    linesOfCode: int
    complexity: int
    testCoverage: int
    authors: int
    # Extended metrics (default 0 so aggregate/directory nodes stay valid).
    hotspotScore: float = 0.0
    bugCommits: int = 0
    ageDays: int = 0
    todoMarkers: int = 0
    functionCount: int = 0
    cognitiveComplexity: int = 0
    duplicatedBlocks: int = 0
    commentLines: int = 0
    couplingDegree: int = 0


class RiskFactor(BaseModel):
    name: str
    score: float


class CouplingPair(BaseModel):
    fileAId: int
    fileBId: int
    fileA: str
    fileB: str
    pathA: str
    pathB: str
    coChanges: int
    degree: float


class AIStatus(BaseModel):
    enabled: bool
    model: str


class AIFileInsight(BaseModel):
    summary: str
    severity: str
    debtDrivers: List[str]
    refactorSteps: List[str]
    estimatedEffort: str


class AIReport(BaseModel):
    markdown: str
    model: str


# ─── Auth ────────────────────────────────────────────────────────────────────

class SignupInput(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _check_password_strength(v)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _check_password_strength(v)


class MessageResponse(BaseModel):
    message: str


class TokenValidity(BaseModel):
    valid: bool


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    name: str
    createdAt: str


class AuthResponse(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    user: UserPublic


class UserSettings(BaseModel):
    theme: str = "dark"            # "dark" | "light"
    defaultColorBy: str = "risk"   # risk | hotspot | churn | complexity | coverage
    defaultView: str = "3d"        # "3d" | "2d"
    avatar: str = ""               # "" (initials) | "preset:<id>" | data-URL (custom upload)


class Commit(BaseModel):
    id: int
    repoId: int
    message: str
    author: str
    authorInitials: str
    timeAgo: str
    hash: str


class FileDetail(FileNode):
    riskFactors: List[RiskFactor]
    recentCommits: List[Commit]


class FileContent(BaseModel):
    path: str
    content: str
    truncated: bool = False


class ActivityPoint(BaseModel):
    month: str          # "YYYY-MM"
    commits: int
    additions: int
    deletions: int
    authors: int


class FindingFactor(BaseModel):
    label: str          # e.g. "Cyclomatic complexity"
    detail: str         # e.g. "47 (top 5% in this repo)"


class Finding(BaseModel):
    fileId: int
    path: str
    name: str
    tdScore: float          # the file's technical-debt score (0–1)
    category: str           # "Hotspot" | "God Class" | "Duplication" | ...
    severity: str           # "high" | "medium" | "low"
    factors: List[FindingFactor]
    recommendation: str
    relatedPaths: List[str] = []   # e.g. coupling partners


class DashboardSummary(BaseModel):
    totalRepositories: int
    totalFiles: int
    totalHighRiskFiles: int
    avgRiskScore: float
    avgTestCoverage: int
    recentlyAnalyzed: List[Repository]


# ─── Chat (multi-model assistant) ─────────────────────────────────────────────

class ChatMessageInput(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatInput(BaseModel):
    messages: List[ChatMessageInput]
    model: Optional[str] = None
    fileId: Optional[int] = None    # the file the user is looking at, for context
    apiKey: Optional[str] = None    # BYOK: sent per request, never stored server-side


class ChatResponse(BaseModel):
    reply: str
    model: str


class ChatModel(BaseModel):
    id: str
    label: str
    free: bool


class ChatModelsResponse(BaseModel):
    models: List[ChatModel]
    hasAppKey: bool    # server has a default key → the free experience works without BYOK


# ─── Learn / Tour (educational walkthrough) ───────────────────────────────────
# A guided, hybrid walkthrough that de-blackboxes a repo for newcomers: each stop
# explains *what* a file does AND teaches the debt concept it illustrates.

class TourStopMetric(BaseModel):
    label: str          # "Risk" | "Churn" | "Complexity" | ...
    value: str          # display value, e.g. "low" or "42 commits"
    tone: str = "neutral"   # "good" | "warn" | "bad" | "neutral" → drives the chip color


class TourStop(BaseModel):
    id: str                              # stable slug for this stop
    fileId: Optional[int] = None         # FileNode this stop centers on (None for the overview)
    path: Optional[str] = None           # convenience copy of the file path
    title: str                           # human label, e.g. "The front door"
    role: str                            # the "what": what this file does + how it connects
    concept: str                         # lesson key: entrypoint|hotspot|coupling|complexity|stable|tests|overview
    conceptTitle: str                    # e.g. "Hotspots: change × complexity"
    lesson: str                          # the "lesson": the debt concept, anchored to this file
    metrics: List[TourStopMetric] = []   # highlighted stats shown on the stop card
    relatedFileIds: List[int] = []       # neighbors to highlight (e.g. coupling partners)


class RepoTour(BaseModel):
    repoId: int
    kind: str = "code"       # "code" (how it works) | "debt" (technical-debt tour)
    generated: bool          # True if AI-authored, False for the heuristic fallback
    model: str               # model id that authored it, or "heuristic"
    summary: str             # one-paragraph orientation for the whole repo
    stops: List[TourStop]    # ordered walkthrough stops
    debtOrder: List[str] = []  # (debt kind only) stop ids, worst-risk first

