import { z } from "zod";

export const fundStatus = z.enum(["raising", "investing", "harvesting", "closed"]);

export const fundSchema = z.object({
  id: z.string().regex(/^FUND-\d{3,}$/),
  name: z.string().min(1),
  vintage_year: z.number().int().min(1900).max(2100),
  target_size_jpy: z.number().nonnegative().optional(),
  committed_jpy: z.number().nonnegative().optional(),
  called_jpy: z.number().nonnegative().optional(),
  status: fundStatus,
  notes: z.string().optional(),
});

export const portfolioStage = z.enum([
  "seed",
  "early",
  "growth",
  "late",
  "exit",
]);

export const portfolioCompanySchema = z.object({
  id: z.string().regex(/^PC-\d{3,}$/),
  name: z.string().min(1),
  fund_id: z.string().regex(/^FUND-\d{3,}$/),
  stage: portfolioStage,
  sector: z.string().optional(),
  invested_jpy: z.number().nonnegative().optional(),
  fair_value_jpy: z.number().nonnegative().optional(),
  ownership_pct: z.number().min(0).max(100).optional(),
  status: z.enum(["active", "written_off", "exited"]).default("active"),
  stakeholder_id: z.string().regex(/^STK-\d{3,}$/).optional(),
  notes: z.string().optional(),
});

export const fundsFileSchema = z.object({
  entity: z.string().min(1),
  as_of: z.string().optional(),
  funds: z.array(fundSchema).default([]),
});

export const portfolioFileSchema = z.object({
  entity: z.string().min(1),
  as_of: z.string().optional(),
  companies: z.array(portfolioCompanySchema).default([]),
});

export type Fund = z.output<typeof fundSchema>;
export type PortfolioCompany = z.output<typeof portfolioCompanySchema>;
export type FundsFile = z.output<typeof fundsFileSchema>;
export type PortfolioFile = z.output<typeof portfolioFileSchema>;
