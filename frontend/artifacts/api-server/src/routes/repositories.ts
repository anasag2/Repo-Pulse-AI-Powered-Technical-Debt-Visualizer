import { Router } from "express";
import { db } from "@workspace/db";
import {
  repositoriesTable,
  fileNodesTable,
  commitsTable,
  riskFactorsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  AnalyzeRepositoryBody,
  GetRepositoryParams,
  DeleteRepositoryParams,
  ListFilesParams,
  GetFileParams,
  ListCommitsParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/repositories", async (req, res) => {
  const repos = await db.select().from(repositoriesTable).orderBy(repositoriesTable.createdAt);
  res.json(repos);
});

router.post("/repositories/analyze", async (req, res) => {
  const parsed = AnalyzeRepositoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { name, url, isPublic = true } = parsed.data;

  const totalFiles = Math.floor(Math.random() * 3000) + 500;
  const riskyFiles = Math.floor(totalFiles * (Math.random() * 0.25 + 0.05));
  const riskyFilesPercent = parseFloat(((riskyFiles / totalFiles) * 100).toFixed(1));
  const avgRiskScore = parseFloat((Math.random() * 0.7 + 0.1).toFixed(2));
  const testCoverage = Math.floor(Math.random() * 60 + 20);
  const linesOfCode = Math.floor(totalFiles * (Math.random() * 150 + 50));
  const authors = Math.floor(Math.random() * 20 + 2);

  const [repo] = await db
    .insert(repositoriesTable)
    .values({
      name,
      url,
      isPublic,
      lastAnalyzed: new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
      totalFiles,
      linesOfCode,
      riskyFiles,
      riskyFilesPercent,
      authors,
      lastCommit: "just now",
      avgRiskScore,
      testCoverage,
      technicalDebt: `${Math.floor(Math.random() * 30)}d ${Math.floor(Math.random() * 24)}h`,
    })
    .returning();

  const dirs = ["src", "tests", "docs", "config", "scripts", "components", "utils", "assets"];
  const files = ["index.ts", "App.tsx", "Button.tsx", "utils.ts", "types.ts", "config.ts", "helpers.ts", "api.ts", "store.ts", "hooks.ts"];

  for (const dir of dirs) {
    await db.insert(fileNodesTable).values({
      repoId: repo.id,
      name: dir,
      path: dir,
      parentPath: "",
      isDirectory: true,
      riskScore: parseFloat((Math.random() * 0.8).toFixed(2)),
      churnCommits: Math.floor(Math.random() * 80),
      linesOfCode: 0,
      complexity: 0,
      testCoverage: 0,
      authors: Math.floor(Math.random() * 6 + 1),
    });

    for (const file of files.slice(0, Math.floor(Math.random() * 5 + 2))) {
      const riskScore = parseFloat((Math.random() * 0.95).toFixed(2));
      await db.insert(fileNodesTable).values({
        repoId: repo.id,
        name: file,
        path: `${dir}/${file}`,
        parentPath: dir,
        isDirectory: false,
        riskScore,
        churnCommits: Math.floor(Math.random() * 100),
        linesOfCode: Math.floor(Math.random() * 800 + 50),
        complexity: Math.floor(Math.random() * 30 + 1),
        testCoverage: Math.floor(Math.random() * 90),
        authors: Math.floor(Math.random() * 8 + 1),
      });
    }
  }

  const fileNodes = await db.select().from(fileNodesTable).where(eq(fileNodesTable.repoId, repo.id));
  for (const fn of fileNodes.filter((f) => !f.isDirectory)) {
    const factorNames = ["High Churn", "High Complexity", "Low Test Coverage", "Large File Size", "Many Authors"];
    const numFactors = Math.floor(Math.random() * 4) + 1;
    for (let i = 0; i < numFactors; i++) {
      await db.insert(riskFactorsTable).values({
        fileId: fn.id,
        name: factorNames[i % factorNames.length],
        score: parseFloat((Math.random() * 0.35).toFixed(2)),
      });
    }
  }

  const commitMessages = [
    "refactor: improve button state logic",
    "feat: add loading spinner",
    "fix: button alignment issue",
    "chore: update dependencies",
    "feat: implement dark mode",
    "fix: resolve race condition",
    "refactor: extract shared utilities",
    "test: add unit tests",
  ];
  const authors2 = ["alex-dev", "samira", "jordan", "priya", "marco"];
  const timeAgos = ["2 hours ago", "1 day ago", "3 days ago", "1 week ago", "2 weeks ago"];

  for (let i = 0; i < 8; i++) {
    const author = authors2[Math.floor(Math.random() * authors2.length)];
    await db.insert(commitsTable).values({
      repoId: repo.id,
      fileId: null,
      message: commitMessages[i % commitMessages.length],
      author,
      authorInitials: author.slice(0, 2).toUpperCase(),
      timeAgo: timeAgos[Math.floor(Math.random() * timeAgos.length)],
      hash: Math.random().toString(36).slice(2, 9),
    });
  }

  res.status(201).json(repo);
});

router.get("/repositories/:id", async (req, res) => {
  const parsed = GetRepositoryParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [repo] = await db.select().from(repositoriesTable).where(eq(repositoriesTable.id, parsed.data.id));
  if (!repo) {
    res.status(404).json({ error: "Repository not found" });
    return;
  }
  res.json(repo);
});

router.delete("/repositories/:id", async (req, res) => {
  const parsed = DeleteRepositoryParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(fileNodesTable).where(eq(fileNodesTable.repoId, parsed.data.id));
  await db.delete(commitsTable).where(eq(commitsTable.repoId, parsed.data.id));
  await db.delete(repositoriesTable).where(eq(repositoriesTable.id, parsed.data.id));
  res.status(204).send();
});

router.get("/repositories/:id/files", async (req, res) => {
  const parsed = ListFilesParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const files = await db.select().from(fileNodesTable).where(eq(fileNodesTable.repoId, parsed.data.id));
  res.json(files);
});

router.get("/repositories/:id/files/:fileId", async (req, res) => {
  const parsed = GetFileParams.safeParse({
    id: parseInt(req.params.id),
    fileId: parseInt(req.params.fileId),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const [file] = await db.select().from(fileNodesTable).where(eq(fileNodesTable.id, parsed.data.fileId));
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  const riskFactors = await db.select().from(riskFactorsTable).where(eq(riskFactorsTable.fileId, file.id));
  const recentCommits = await db.select().from(commitsTable).where(eq(commitsTable.repoId, parsed.data.id)).limit(5);
  res.json({ ...file, riskFactors, recentCommits });
});

router.get("/repositories/:id/commits", async (req, res) => {
  const parsed = ListCommitsParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const commits = await db.select().from(commitsTable).where(eq(commitsTable.repoId, parsed.data.id)).limit(20);
  res.json(commits);
});

export default router;
