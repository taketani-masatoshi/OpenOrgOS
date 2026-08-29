import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { FixedAsset } from "../../../schemas/finance/types.js";
import { loadFixedAssets } from "../data.js";
import { ROOT_DIR } from "../utils.js";
import { appendJournalEntry } from "./expense-claim-journal.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";

const MONTHS_PER_YEAR = 12;

const depreciationRatesSchema = z.object({
  version: z.literal(1),
  fiscal_year_label: z.string().optional(),
  declining_balance_rates: z
    .array(
      z.object({
        useful_life_years: z.number().int().positive(),
        rate_pct: z.number().positive(),
        revised_rate_pct: z.number().positive().optional(),
        guarantee_rate_pct: z.number().min(0).max(1).optional(),
      }),
    )
    .default([]),
});

export type DepreciationScheduleLine = {
  asset_id: string;
  asset_name: string;
  period: string;
  method: string;
  monthly_depreciation_yen: number;
  annual_depreciation_yen: number;
  expense_account_code: string;
  accumulated_account_code: string;
};

function readRatesFile(): z.output<typeof depreciationRatesSchema> {
  const path = join(
    ROOT_DIR,
    "steward/jurisdiction-packs/JP/seed/depreciation-rates-2026.yaml",
  );
  if (!existsSync(path)) {
    return depreciationRatesSchema.parse({
      version: 1,
      declining_balance_rates: [],
    });
  }
  return depreciationRatesSchema.parse(
    YAML.parse(readFileSync(path, "utf-8")) as unknown,
  );
}

function monthsInService(asset: FixedAsset, period: string): boolean {
  const start =
    asset.placed_in_service_month ??
    asset.acquisition_month ??
    asset.acquisition_date?.slice(0, 7);
  if (!start) return false;
  return period >= start;
}

export function computeStraightLineMonthly(asset: FixedAsset): number {
  if (asset.depreciation_method === "非償却") return 0;
  if (!asset.useful_life_years || asset.useful_life_years <= 0) return 0;
  const annual = Math.floor(asset.acquisition_cost / asset.useful_life_years);
  return Math.floor(annual / MONTHS_PER_YEAR);
}

export function computeDecliningBalanceMonthly(
  asset: FixedAsset,
  bookValue: number,
): number {
  if (!asset.useful_life_years) return 0;
  const rates = readRatesFile();
  const row = rates.declining_balance_rates.find(
    (r) => r.useful_life_years === asset.useful_life_years,
  );
  const ratePct = row?.rate_pct ?? 100 / asset.useful_life_years;
  const annual = Math.floor((bookValue * ratePct) / 100);
  return Math.floor(annual / MONTHS_PER_YEAR);
}

export function computeAssetMonthlyDepreciation(
  asset: FixedAsset,
  period: string,
): number {
  if (!monthsInService(asset, period)) return 0;
  if (asset.depreciation_method === "非償却") return 0;
  if (asset.depreciation_method === "定額法") {
    return computeStraightLineMonthly(asset);
  }
  return computeDecliningBalanceMonthly(asset, asset.book_value);
}

export function buildDepreciationSchedule(period: string): DepreciationScheduleLine[] {
  const accounts = resolveJournalSourceAccounts();
  const file = loadFixedAssets();
  return file.assets.flatMap((asset): DepreciationScheduleLine[] => {
    const monthly = computeAssetMonthlyDepreciation(asset, period);
    if (monthly <= 0) return [];
    return [
      {
        asset_id: asset.id,
        asset_name: asset.name,
        period,
        method: asset.depreciation_method,
        monthly_depreciation_yen: monthly,
        annual_depreciation_yen: monthly * MONTHS_PER_YEAR,
        expense_account_code: accounts.depreciation_expense,
        accumulated_account_code: accounts.accumulated_depreciation,
      },
    ];
  });
}

/** Annual straight-line depreciation (定額法). */
export function computeStraightLineAnnualDepreciation(
  acquisitionCost: number,
  usefulLifeYears: number,
): number {
  if (usefulLifeYears <= 0) return 0;
  return Math.floor(acquisitionCost / usefulLifeYears);
}

function computeExpectedAnnualDepreciation(asset: FixedAsset): number {
  if (asset.depreciation_method === "非償却") return 0;
  if (asset.depreciation_method === "定額法") {
    return computeStraightLineAnnualDepreciation(
      asset.acquisition_cost,
      asset.useful_life_years ?? 0,
    );
  }
  return computeStraightLineMonthly(asset) * MONTHS_PER_YEAR;
}

export function validateDepreciationConsistency(): string[] {
  const file = loadFixedAssets();
  const issues: string[] = [];
  for (const asset of file.assets) {
    if (asset.depreciation_method === "非償却") continue;
    const computedAnnual = computeExpectedAnnualDepreciation(asset);
    if (Math.abs(asset.annual_depreciation - computedAnnual) > 1) {
      issues.push(
        `${asset.id}: annual_depreciation ${asset.annual_depreciation} != computed ${computedAnnual}`,
      );
    }
    if (
      asset.fy_depreciation_jpy === 0 &&
      asset.placed_in_service_month &&
      asset.annual_depreciation > 0
    ) {
      const start = asset.placed_in_service_month.slice(0, 7);
      const [y, m] = start.split("-").map(Number);
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      const monthBefore = `${prevY}-${String(prevM).padStart(2, "0")}`;
      if (computeAssetMonthlyDepreciation(asset, monthBefore) > 0) {
        issues.push(
          `${asset.id}: placed_in_service_month ${asset.placed_in_service_month} より前の月で償却スケジュールが非ゼロ`,
        );
      }
    }
    const expectedBook =
      asset.acquisition_cost - asset.accumulated_depreciation;
    if (Math.abs(expectedBook - asset.book_value) > 1) {
      issues.push(
        `${asset.id}: book_value ${asset.book_value} != acquisition - accumulated (${expectedBook})`,
      );
    }
  }
  return issues;
}

export type DepreciationVerifyResult = {
  asset_count: number;
  issues: string[];
};

export function verifyAllFixedAssetDepreciation(): DepreciationVerifyResult {
  const fa = loadFixedAssets();
  return {
    asset_count: fa.assets.length,
    issues: validateDepreciationConsistency(),
  };
}

export function formatDepreciationVerifyMarkdown(
  result: DepreciationVerifyResult,
): string {
  const lines = [
    "# 減価償却検算",
    "",
    `対象資産: ${result.asset_count} 件`,
    "",
  ];
  if (result.issues.length === 0) {
    lines.push("警告なし（税理士確定額の代替ではありません）");
  } else {
    lines.push("## 警告", "");
    for (const i of result.issues) {
      lines.push(`- ${i}`);
    }
  }
  return lines.join("\n");
}

export function postDepreciationJournalEntries(input: {
  period: string;
  authorizedBy: string;
}): string[] {
  const schedule = buildDepreciationSchedule(input.period);
  const posted: string[] = [];
  for (const line of schedule) {
    const entryId = `JE-DEP-${line.asset_id}-${input.period}`;
    appendJournalEntry({
      entry_id: entryId,
      occurred_at: `${input.period}-28T00:00:00.000Z`,
      description: `Depreciation ${line.asset_name} ${input.period}`,
      source: {
        kind: "depreciation",
        asset_id: line.asset_id,
        period: input.period,
      },
      evidence_refs: [`fixed-asset:${line.asset_id}`, `period:${input.period}`],
      lines: [
        {
          account_code: line.expense_account_code,
          debit_yen: line.monthly_depreciation_yen,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: line.accumulated_account_code,
          debit_yen: 0,
          credit_yen: line.monthly_depreciation_yen,
          tax_category: "out_of_scope",
        },
      ],
    });
    posted.push(entryId);
  }
  return posted;
}
