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


class RiskFactor(BaseModel):
    name: str
    score: float


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
