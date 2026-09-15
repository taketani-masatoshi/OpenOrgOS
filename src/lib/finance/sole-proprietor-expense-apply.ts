/**
 * expense-intake apply side effects: journal · fixed-asset register · allocation YAML.
 * Idempotent on entry_id JE-EI-{intake_id}.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  fixedAssetsSchema,
} from "../../../schemas/finance/balance-assets.js";
import type { FixedAsset, FixedAssets } from "../../../schemas/finance/types.js";
import { journalEntrySchema } from "../../../schemas/finance/journal-entry.js";
import type { BlueReturnExpenseIntake } from "../../../schemas/finance/blue-return-expense-intake.js";
import { loadChartOfAccounts } from "../data.js";
import { getDataDir, writeYamlFile, tokyoCalendarDate } from "../utils.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import { computeRewardFeeWithholdingYen } from "./withholding-payments.js";

export type ExpenseIntakeApplyResult = {
  journal_entry_id: string | null;
  journal_posted: boolean;
  fixed_asset_id: string | null;
  allocation_updated: boolean;
  notes: string[];
};

function entryIdForIntake(intakeId: string): string {
  const safe = intakeId.replace(/[^A-Z0-9-]/gi, "-").toUpperCase();
  if (safe.startsWith("JE-")) return safe;
  return `JE-${safe}`;
}

function assetIdForIntake(intakeId: string): string {
  const digits = intakeId.replace(/\D/g, "").slice(-3).padStart(3, "0") || "001";
  return `ASSET-${digits}`;
}

function toOccurredAt(date: string): string {
  return `${date.slice(0, 10)}T03:00:00.000Z`;
}

function resolvePayAccount(): string {
  const coa = loadChartOfAccounts();
  return coa.journal_source_accounts?.bank_control ?? "1120";
}

function resolveDebitAccount(
  intake: BlueReturnExpenseIntake,
  choice: BlueReturnExpenseIntake["depreciation_choice"],
): { code: string; notes: string[] } {
  const notes: string[] = [];
  const coa = loadChartOfAccounts();
  const codes = new Set(coa.accounts.map((a) => a.code));
  const fallback = intake.account_code ?? "5200";
  if (choice === "ordinary_fixed_asset") {
    if (codes.has("1410")) return { code: "1410", notes };
    notes.push("CoA に 1410 器具備品なし — intake.account_code で計上");
    return { code: fallback, notes };
  }
  if (choice === "lump_sum") {
    if (codes.has("1300")) return { code: "1300", notes };
    notes.push("CoA に 1300 一括償却資産なし — intake.account_code で計上（台帳は更新）");
    return { code: fallback, notes };
  }
  return { code: fallback, notes };
}

function businessGrossYen(intake: BlueReturnExpenseIntake): {
  business: number;
  household: number;
  pct: number;
} {
  const pct =
    intake.business_use === "business_only"
      ? 100
      : (intake.business_pct ?? 100);
  const business = Math.round((intake.amount_yen * pct) / 100);
  return { business, household: intake.amount_yen - business, pct };
}

function splitTaxInclusive(grossYen: number): { base: number; tax: number } {
  const base = Math.round(grossYen / 1.1);
  return { base, tax: grossYen - base };
}

function loadFixedAssetsFile(): FixedAssets {
  const path = join(getDataDir(), "finance", "fixed-assets.yaml");
  if (!existsSync(path)) {
    return fixedAssetsSchema.parse({
      as_of: tokyoCalendarDate(),
      currency: "JPY",
      assets: [],
      summary: {
        total_acquisition_cost: 0,
        total_accumulated_depreciation: 0,
        total_book_value: 0,
        annual_depreciation_fy_current: 0,
      },
    });
  }
  return fixedAssetsSchema.parse(YAML.parse(readFileSync(path, "utf-8")) as unknown);
}

function saveFixedAssetsFile(file: FixedAssets): void {
  const path = join(getDataDir(), "finance", "fixed-assets.yaml");
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  const assets = file.assets;
  const summary = {
    total_acquisition_cost: assets.reduce((s, a) => s + a.acquisition_cost, 0),
    total_accumulated_depreciation: assets.reduce(
      (s, a) => s + a.accumulated_depreciation,
      0,
    ),
    total_book_value: assets.reduce((s, a) => s + a.book_value, 0),
    annual_depreciation_fy_current: assets.reduce(
      (s, a) => s + (a.fy_depreciation_jpy ?? a.annual_depreciation),
      0,
    ),
  };
  writeYamlFile(path, fixedAssetsSchema.parse({ ...file, summary }));
}

function upsertFixedAssetFromIntake(intake: BlueReturnExpenseIntake): string {
  const id = assetIdForIntake(intake.intake_id);
  const cost = businessGrossYen(intake).business;
  const choice = intake.depreciation_choice ?? "expense";
  const placed =
    intake.placed_in_service_month ??
    (intake.occurred_on ? intake.occurred_on.slice(0, 7) : undefined);
  const annual =
    choice === "lump_sum"
      ? Math.ceil(cost / 3)
      : choice === "ordinary_fixed_asset"
        ? Math.round(cost / Math.max(1, 5))
        : cost;
  const asset: FixedAsset = {
    id,
    sole_prop_equipment: true,
    name: intake.expense_line ?? `intake ${intake.intake_id}`,
    category: "器具備品",
    acquisition_date: intake.occurred_on ?? intake.paid_on,
    placed_in_service_month: placed,
    acquisition_cost: cost,
    useful_life_years: choice === "lump_sum" ? 3 : choice === "ordinary_fixed_asset" ? 5 : 1,
    depreciation_method: "定額法",
    annual_depreciation: annual,
    fy_depreciation_jpy: choice === "sme_special" || choice === "expense" ? cost : annual,
    accumulated_depreciation: 0,
    book_value: cost,
    amortization_scheme:
      choice === "lump_sum"
        ? "lump_sum_3y"
        : choice === "ordinary_fixed_asset"
          ? "ordinary"
          : "none",
    tax_notes:
      choice === "lump_sum"
        ? "一括償却資産（取得価額の1/3ずつ・3年）"
        : choice === "sme_special"
          ? "中小企業者等の少額減価償却資産の取得価額の損金算入の特例（帳簿は費用計上）"
          : "普通減価償却（個人事業主設備・property 非紐付）",
  };
  const file = loadFixedAssetsFile();
  const idx = file.assets.findIndex((a) => a.id === id);
  if (idx >= 0) file.assets[idx] = asset;
  else file.assets.push(asset);
  if (intake.occurred_on) {
    file.as_of = intake.occurred_on.slice(0, 4) + "-12-31";
    file.fiscal_year = `CY${intake.occurred_on.slice(0, 4)}`;
  }
  saveFixedAssetsFile(file);
  return id;
}

function updateAllocationFromIntake(intake: BlueReturnExpenseIntake): boolean {
  if (intake.business_use !== "shared") return false;
  if (intake.allocation_write_mode !== "update_yaml") return false;
  if (intake.business_pct === undefined || !intake.account_code) return false;
  const path = join(getDataDir(), "finance", "blue-return-allocation.yaml");
  const raw = existsSync(path)
    ? (YAML.parse(readFileSync(path, "utf-8")) as Record<string, unknown>)
    : { version: 1, by_account: {}, by_entry: {} };
  const byAccount =
    (raw.by_account as Record<string, { business_pct: number; notes?: string }>) ??
    {};
  byAccount[intake.account_code] = {
    business_pct: intake.business_pct,
    notes: `from expense-intake ${intake.intake_id}`,
  };
  raw.by_account = byAccount;
  if (intake.occurred_on) {
    raw.calendar_year = Number.parseInt(intake.occurred_on.slice(0, 4), 10);
  }
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(path, raw);
  return true;
}

/**
 * Build and append journal for a completed expense intake.
 * Skips if JE-EI-{id} already exists (idempotent).
 */
export function applyExpenseIntakeSideEffects(
  intake: BlueReturnExpenseIntake,
  opts?: { postJournal?: boolean; authorizedBy?: string },
): ExpenseIntakeApplyResult {
  const notes: string[] = [];
  const postJournal = opts?.postJournal !== false;
  const authorizedBy = opts?.authorizedBy ?? "expense-intake";
  const choice = intake.depreciation_choice ?? "expense";
  const { business, household, pct } = businessGrossYen(intake);
  const payCode = resolvePayAccount();
  const debit = resolveDebitAccount(intake, choice);
  notes.push(...debit.notes);

  let fixed_asset_id: string | null = null;
  if (
    choice === "ordinary_fixed_asset" ||
    choice === "lump_sum" ||
    choice === "sme_special"
  ) {
    fixed_asset_id = upsertFixedAssetFromIntake(intake);
    notes.push(`fixed-assets.yaml upsert ${fixed_asset_id}`);
  }

  const allocation_updated = updateAllocationFromIntake(intake);
  if (allocation_updated) notes.push("blue-return-allocation.yaml updated");

  const jeId = entryIdForIntake(intake.intake_id);
  if (!postJournal) {
    return {
      journal_entry_id: null,
      journal_posted: false,
      fixed_asset_id,
      allocation_updated,
      notes: [...notes, "journal skipped (--no-journal)"],
    };
  }

  const existing = loadJournalEntries().entries.find((e) => e.entry_id === jeId);
  if (existing) {
    return {
      journal_entry_id: jeId,
      journal_posted: false,
      fixed_asset_id,
      allocation_updated,
      notes: [...notes, `journal already exists ${jeId}`],
    };
  }

  const occurred = intake.occurred_on ?? intake.paid_on;
  if (!occurred) {
    throw new Error("expense intake requires occurred_on or paid_on to post journal");
  }

  const evidence =
    intake.evidence_refs && intake.evidence_refs.length > 0
      ? intake.evidence_refs
      : [`intake:${intake.intake_id}`];

  const lines: Array<{
    account_code: string;
    debit_yen: number;
    credit_yen: number;
    tax_category?: "taxable_10" | "out_of_scope";
  }> = [];

  const taxInclusive = intake.tax_inclusive !== false;
  let expenseYen = business;
  let taxYen = 0;
  if (
    taxInclusive &&
    business > 0 &&
    choice !== "ordinary_fixed_asset" &&
    choice !== "lump_sum" &&
    intake.timing !== "prepaid"
  ) {
    const split = splitTaxInclusive(business);
    expenseYen = split.base;
    taxYen = split.tax;
  }

  const timing = intake.timing ?? "current_expense";
  const coaCodes = new Set(loadChartOfAccounts().accounts.map((a) => a.code));

  if (timing === "prepaid") {
    if (!coaCodes.has("1180")) {
      throw new Error(
        "timing=prepaid には CoA 1180 前払費用が必要です（seed chart-of-accounts を更新）",
      );
    }
    if (business > 0) {
      lines.push({
        account_code: "1180",
        debit_yen: business,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    if (household > 0) {
      lines.push({
        account_code: "3210",
        debit_yen: household,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    lines.push({
      account_code: payCode,
      debit_yen: 0,
      credit_yen: intake.amount_yen,
      tax_category: "out_of_scope",
    });
    notes.push(
      `timing=prepaid · Dr 前払費用 ${business} / Dr 事業主貸 ${household} / Cr 預金`,
    );
  } else if (timing === "accrued") {
    const payable =
      loadChartOfAccounts().journal_source_accounts?.accounts_payable ?? "2110";
    if (choice === "ordinary_fixed_asset" || choice === "lump_sum") {
      lines.push({
        account_code: debit.code,
        debit_yen: business,
        credit_yen: 0,
        tax_category: taxInclusive ? "taxable_10" : "out_of_scope",
      });
    } else {
      lines.push({
        account_code: debit.code,
        debit_yen: expenseYen,
        credit_yen: 0,
        tax_category: "taxable_10",
      });
      if (taxYen > 0) {
        lines.push({
          account_code: "2170",
          debit_yen: taxYen,
          credit_yen: 0,
          tax_category: "out_of_scope",
        });
      }
    }
    if (household > 0) {
      lines.push({
        account_code: "3210",
        debit_yen: household,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    lines.push({
      account_code: payable,
      debit_yen: 0,
      credit_yen: intake.amount_yen,
      tax_category: "out_of_scope",
    });
    notes.push(`timing=accrued · Cr 未払金 ${payable}`);
  } else if (choice === "ordinary_fixed_asset" || choice === "lump_sum") {
    lines.push({
      account_code: debit.code,
      debit_yen: business,
      credit_yen: 0,
      tax_category: taxInclusive ? "taxable_10" : "out_of_scope",
    });
    if (household > 0) {
      lines.push({
        account_code: "3210",
        debit_yen: household,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    if (intake.withholding_applicable) {
      const wh = computeRewardFeeWithholdingYen(business);
      const net = intake.amount_yen - wh;
      lines.push({
        account_code: "2120",
        debit_yen: 0,
        credit_yen: wh,
        tax_category: "out_of_scope",
      });
      lines.push({
        account_code: payCode,
        debit_yen: 0,
        credit_yen: net,
        tax_category: "out_of_scope",
      });
    } else {
      lines.push({
        account_code: payCode,
        debit_yen: 0,
        credit_yen: intake.amount_yen,
        tax_category: "out_of_scope",
      });
    }
  } else {
    lines.push({
      account_code: debit.code,
      debit_yen: expenseYen,
      credit_yen: 0,
      tax_category: "taxable_10",
    });
    if (taxYen > 0) {
      lines.push({
        account_code: "2170",
        debit_yen: taxYen,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    if (household > 0) {
      lines.push({
        account_code: "3210",
        debit_yen: household,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    if (intake.withholding_applicable) {
      const wh = computeRewardFeeWithholdingYen(business);
      const net = intake.amount_yen - wh;
      lines.push({
        account_code: "2120",
        debit_yen: 0,
        credit_yen: wh,
        tax_category: "out_of_scope",
      });
      lines.push({
        account_code: payCode,
        debit_yen: 0,
        credit_yen: net,
        tax_category: "out_of_scope",
      });
    } else {
      lines.push({
        account_code: payCode,
        debit_yen: 0,
        credit_yen: intake.amount_yen,
        tax_category: "out_of_scope",
      });
    }
  }

  const entry = journalEntrySchema.parse({
    entry_id: jeId,
    occurred_at: toOccurredAt(occurred),
    description: `expense-intake ${intake.intake_id} · ${intake.expense_line ?? choice} · 事業${pct}% · ${timing}`,
    source: { kind: "manual", authorized_by: authorizedBy },
    evidence_refs: evidence,
    lines,
  });
  appendJournalEntry(entry, { postedBy: authorizedBy });
  notes.push(`journal posted ${jeId}`);

  return {
    journal_entry_id: jeId,
    journal_posted: true,
    fixed_asset_id,
    allocation_updated,
    notes,
  };
}
