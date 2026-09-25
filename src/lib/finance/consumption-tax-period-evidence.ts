/**
 * Period-wide evidence for common-use allocation and transitional invoice credits.
 * Without this file, GL lines marked common / nonqualified_80|50 refuse auto-deduction.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";

const evidenceSchema = z.object({
  version: z.literal(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  /** Taxable sales ratio for 一括比例配分 (0–100). Required for purchase_use=common. */
  taxable_sales_ratio_pct: z.number().min(0).max(100).optional(),
  /** Confirmed eligibility to apply invoice transitional rates in this period. */
  transitional: z
    .object({
      eligible: z.literal(true),
      rate_pct: z.union([z.literal(80), z.literal(50)]),
      evidence_refs: z.array(z.string().min(1)).min(1),
    })
    .optional(),
  notes: z.string().optional(),
});

export type ConsumptionTaxPeriodEvidence = z.output<typeof evidenceSchema>;

export function consumptionTaxPeriodEvidencePath(period: string): string {
  return join(getDataDir(), "finance", "consumption-tax-period-evidence", `${period}.yaml`);
}

export function readConsumptionTaxPeriodEvidence(
  period: string
): ConsumptionTaxPeriodEvidence | null {
  const path = consumptionTaxPeriodEvidencePath(period);
  if (!existsSync(path)) return null;
  const parsed = evidenceSchema.parse(YAML.parse(readFileSync(path, "utf8")));
  if (parsed.period !== period) throw new Error("Consumption tax period evidence mismatch");
  return parsed;
}

export function applyCommonUseAllocation(
  taxYen: number,
  evidence: ConsumptionTaxPeriodEvidence | null
): number {
  if (evidence?.taxable_sales_ratio_pct === undefined) {
    throw new Error("Common-use purchase tax allocation requires taxable_sales_ratio_pct evidence");
  }
  return Math.trunc((taxYen * evidence.taxable_sales_ratio_pct) / 100);
}

export function applyTransitionalInvoiceRate(
  taxYen: number,
  invoiceStatus: "nonqualified_80" | "nonqualified_50",
  evidence: ConsumptionTaxPeriodEvidence | null
): number {
  const expected = invoiceStatus === "nonqualified_80" ? 80 : 50;
  if (!evidence?.transitional?.eligible || evidence.transitional.rate_pct !== expected) {
    throw new Error(
      `Transitional invoice deduction rates require period evidence for ${expected}%`
    );
  }
  return Math.trunc((taxYen * expected) / 100);
}
