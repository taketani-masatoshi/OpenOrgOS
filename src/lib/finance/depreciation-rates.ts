/**
 * Load declining-balance rates from the active JP jurisdiction pack seed.
 * Missing useful-life rows refuse; no 100/n fallback.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getInstallRoot } from "../orgos-paths.js";
import { assertJapaneseFinanceEngine } from "./jp-engine-guard.js";

const rateRowSchema = z.object({
  useful_life_years: z.number().int().positive(),
  rate_pct: z.number().positive().max(100),
  revised_rate_pct: z.number().positive().max(100),
  guarantee_rate_pct: z.number().positive().max(1),
});

const ratesFileSchema = z.object({
  version: z.literal(1),
  declining_balance_rates: z.array(rateRowSchema).min(1),
});

export type DecliningBalanceRateRow = z.output<typeof rateRowSchema>;

export function decliningBalanceRatesPath(): string {
  return join(
    getInstallRoot(),
    "steward/jurisdiction-packs/JP/seed/depreciation-rates-2026.yaml"
  );
}

export function loadDecliningBalanceRates(): DecliningBalanceRateRow[] {
  assertJapaneseFinanceEngine();
  const path = decliningBalanceRatesPath();
  if (!existsSync(path)) throw new Error("Declining-balance rate seed missing from JP pack");
  return ratesFileSchema.parse(YAML.parse(readFileSync(path, "utf8"))).declining_balance_rates;
}

export function resolveDecliningBalanceRate(usefulLifeYears: number): DecliningBalanceRateRow {
  const row = loadDecliningBalanceRates().find((r) => r.useful_life_years === usefulLifeYears);
  if (!row) {
    throw new Error(
      `Declining-balance rate not registered for useful life ${usefulLifeYears} years`
    );
  }
  return row;
}
