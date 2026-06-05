import { pgTable, text, serial, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const repositoriesTable = pgTable("repositories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  isPublic: boolean("is_public").notNull().default(true),
  lastAnalyzed: text("last_analyzed").notNull(),
  totalFiles: integer("total_files").notNull().default(0),
  linesOfCode: integer("lines_of_code").notNull().default(0),
  riskyFiles: integer("risky_files").notNull().default(0),
  riskyFilesPercent: real("risky_files_percent").notNull().default(0),
  authors: integer("authors").notNull().default(1),
  lastCommit: text("last_commit").notNull().default(""),
  avgRiskScore: real("avg_risk_score").notNull().default(0),
  testCoverage: integer("test_coverage").notNull().default(0),
  technicalDebt: text("technical_debt").notNull().default("0d"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRepositorySchema = createInsertSchema(repositoriesTable).omit({ id: true, createdAt: true });
export type InsertRepository = z.infer<typeof insertRepositorySchema>;
export type Repository = typeof repositoriesTable.$inferSelect;
