import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commitsTable = pgTable("commits", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").notNull(),
  fileId: integer("file_id"),
  message: text("message").notNull(),
  author: text("author").notNull(),
  authorInitials: text("author_initials").notNull(),
  timeAgo: text("time_ago").notNull(),
  hash: text("hash").notNull(),
});

export const insertCommitSchema = createInsertSchema(commitsTable).omit({ id: true });
export type InsertCommit = z.infer<typeof insertCommitSchema>;
export type Commit = typeof commitsTable.$inferSelect;
