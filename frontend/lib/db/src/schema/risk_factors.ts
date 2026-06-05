import { pgTable, text, serial, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const riskFactorsTable = pgTable("risk_factors", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull(),
  name: text("name").notNull(),
  score: real("score").notNull().default(0),
});

export const insertRiskFactorSchema = createInsertSchema(riskFactorsTable).omit({ id: true });
export type InsertRiskFactor = z.infer<typeof insertRiskFactorSchema>;
export type RiskFactor = typeof riskFactorsTable.$inferSelect;
