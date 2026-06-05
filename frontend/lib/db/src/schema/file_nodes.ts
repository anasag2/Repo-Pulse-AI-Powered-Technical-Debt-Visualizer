import { pgTable, text, serial, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fileNodesTable = pgTable("file_nodes", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  parentPath: text("parent_path").notNull().default(""),
  isDirectory: boolean("is_directory").notNull().default(false),
  riskScore: real("risk_score").notNull().default(0),
  churnCommits: integer("churn_commits").notNull().default(0),
  linesOfCode: integer("lines_of_code").notNull().default(0),
  complexity: integer("complexity").notNull().default(0),
  testCoverage: integer("test_coverage").notNull().default(0),
  authors: integer("authors").notNull().default(1),
});

export const insertFileNodeSchema = createInsertSchema(fileNodesTable).omit({ id: true });
export type InsertFileNode = z.infer<typeof insertFileNodeSchema>;
export type FileNode = typeof fileNodesTable.$inferSelect;
