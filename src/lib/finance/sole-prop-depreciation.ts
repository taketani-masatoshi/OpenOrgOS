/**
 * Sole-prop depreciation / lump-sum year posts.
 */
import { loadChartOfAccounts, loadFixedAssets } from "../data.js";
import { journalEntrySchema } from "../../../schemas/finance/journal-entry.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import { postDepreciationJournalEntries } from "./depreciation.js";
import type { FixedAsset } from "../../../schemas/finance/types.js";

function isLumpSum(asset: FixedAsset): boolean {
  if (asset.amortization_scheme === "lump_sum_3y") return true;
  return (asset.tax_notes ?? "").includes("一括償却");
}

function isOrdinary(asset: FixedAsset): boolean {
  return (
    asset.amortization_scheme === "ordinary" ||
    (asset.sole_prop_equipment === true && !isLumpSum(asset) && asset.amortization_scheme !== "none")
  );
}

function yearAmount(asset: FixedAsset): number {
  if (asset.annual_depreciation > 0) return Math.round(asset.annual_depreciation);
  return Math.ceil(asset.acquisition_cost / 3);
}

/**
 * Post 1/3 lump-sum amortization for calendar year (idempotent JE-LUMP-{id}-{year}).
 */
export function postLumpSumYearAmortization(input: {
  calendarYear: number;
  assetId?: string;
  authorizedBy?: string;
}): { posted: string[]; skipped: string[] } {
  const coa = loadChartOfAccounts();
  const expense =
    coa.journal_source_accounts?.depreciation_expense ??
    (coa.accounts.some((a) => a.code === "5210") ? "5210" : "5100");
  const creditDefault =
    coa.accounts.some((a) => a.code === "1300")
      ? "1300"
      : (coa.journal_source_accounts?.accumulated_depreciation ?? "1300");
  const authorizedBy = input.authorizedBy ?? "sole-prop-depr";
  const existing = new Set(loadJournalEntries().entries.map((e) => e.entry_id));
  const posted: string[] = [];
  const skipped: string[] = [];

  const assets = loadFixedAssets().assets.filter((a) => {
    if (!isLumpSum(a)) return false;
    if (input.assetId && a.id !== input.assetId) return false;
    const acqYear = (a.acquisition_date ?? a.acquisition_month ?? "").slice(0, 4);
    if (acqYear && Number.parseInt(acqYear, 10) > input.calendarYear) return false;
    // 3-year window from acquisition year
    if (acqYear) {
      const start = Number.parseInt(acqYear, 10);
      if (input.calendarYear < start || input.calendarYear > start + 2) return false;
    }
    return true;
  });

  for (const asset of assets) {
    const entryId = `JE-LUMP-${asset.id}-${input.calendarYear}`;
    if (existing.has(entryId)) {
      skipped.push(entryId);
      continue;
    }
    const amount = yearAmount(asset);
    if (amount <= 0) {
      skipped.push(`${asset.id}:zero`);
      continue;
    }
    const credit =
      coa.accounts.some((a) => a.code === "1300") ? "1300" : creditDefault;
    appendJournalEntry(
      journalEntrySchema.parse({
        entry_id: entryId,
        occurred_at: `${input.calendarYear}-12-31T03:00:00.000Z`,
        description: `一括償却 ${asset.name} ${input.calendarYear}年分`,
        source: {
          kind: "depreciation",
          asset_id: asset.id,
          period: `${input.calendarYear}-12`,
        },
        evidence_refs: [`fixed-asset:${asset.id}`, `lump-sum:${input.calendarYear}`],
        lines: [
          {
            account_code: expense,
            debit_yen: amount,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: credit,
            debit_yen: 0,
            credit_yen: amount,
            tax_category: "out_of_scope",
          },
        ],
      }),
      { postedBy: authorizedBy },
    );
    posted.push(entryId);
  }
  return { posted, skipped };
}

/**
 * Post monthly ordinary depreciation for placed-in-service assets (wraps core).
 * Uses December of calendar year as default period when only year given.
 */
export function postOrdinaryDepreciationForYear(input: {
  calendarYear: number;
  authorizedBy?: string;
}): { posted: string[]; notes: string[] } {
  const notes: string[] = [];
  const ordinary = loadFixedAssets().assets.filter(isOrdinary);
  if (ordinary.length === 0) {
    notes.push("ordinary fixed assets: none");
    return { posted: [], notes };
  }
  // Post December period as year-end catch-up using existing monthly engine
  const period = `${input.calendarYear}-12`;
  const posted = postDepreciationJournalEntries({
    period,
    authorizedBy: input.authorizedBy ?? "sole-prop-depr",
  });
  notes.push(`ordinary via postDepreciationJournalEntries ${period}`);
  return { posted, notes };
}

export function postSolePropDepreciationYear(input: {
  calendarYear: number;
  assetId?: string;
  authorizedBy?: string;
}): {
  lump: ReturnType<typeof postLumpSumYearAmortization>;
  ordinary: ReturnType<typeof postOrdinaryDepreciationForYear>;
} {
  return {
    lump: postLumpSumYearAmortization(input),
    ordinary: input.assetId
      ? { posted: [], notes: ["ordinary skipped when --asset-id set (lump only)"] }
      : postOrdinaryDepreciationForYear(input),
  };
}
