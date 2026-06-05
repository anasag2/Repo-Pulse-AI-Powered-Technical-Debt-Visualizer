import { Router } from "express";
import { db } from "@workspace/db";
import { repositoriesTable, fileNodesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  const repos = await db.select().from(repositoriesTable);
  const files = await db.select({ id: fileNodesTable.id, riskScore: fileNodesTable.riskScore, isDirectory: fileNodesTable.isDirectory }).from(fileNodesTable);

  const totalRepositories = repos.length;
  const fileNodes = files.filter((f) => !f.isDirectory);
  const totalFiles = fileNodes.length;
  const totalHighRiskFiles = fileNodes.filter((f) => f.riskScore > 0.6).length;
  const avgRiskScore = repos.length > 0
    ? parseFloat((repos.reduce((acc, r) => acc + r.avgRiskScore, 0) / repos.length).toFixed(2))
    : 0;
  const avgTestCoverage = repos.length > 0
    ? Math.round(repos.reduce((acc, r) => acc + r.testCoverage, 0) / repos.length)
    : 0;
  const recentlyAnalyzed = repos.slice(-3).reverse();

  res.json({
    totalRepositories,
    totalFiles,
    totalHighRiskFiles,
    avgRiskScore,
    avgTestCoverage,
    recentlyAnalyzed,
  });
});

export default router;
