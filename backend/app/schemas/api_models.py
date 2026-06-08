"""
Pydantic response models that mirror the frontend's OpenAPI contract
(lib/api-spec/openapi.yaml). Field names are intentionally camelCase to match
exactly what the generated `@workspace/api-client-react` client expects.
"""
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel


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


class DashboardSummary(BaseModel):
    totalRepositories: int
    totalFiles: int
    totalHighRiskFiles: int
    avgRiskScore: float
    avgTestCoverage: int
    recentlyAnalyzed: List[Repository]
