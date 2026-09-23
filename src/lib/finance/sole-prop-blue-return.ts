/**
 * Advisor draft of the general-use blue return statement.
 * Line ids come from the JP pack map. Not an official form and not for filing.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { loadChartOfAccounts } from "../data.js";
import { getInstallRoot } from "../orgos-paths.js";
import { getDataDir } from "../utils.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import {
  fiscalYearEndDate,
  fiscalYearStartDate,
  resolveCompanyFiscalYearEndMonth,
} from "./fiscal-year.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { BLUE_RETURN_DEDUCTION_CAP_YEN } from "./income-tax-policy.js";
import { isSoleProprietorship } from "./sole-prop-entity.js";

const lineMapSchema = z.object({
  form: z.literal("blue_return_general"),
  lines: z.array(
    z.object({
      id: z.string().min(1),
      print: z.string(),
      label: z.string().min(1),
      section: z.enum(["pl", "bs"]),
      source: z.enum([
        "revenue",
        "account_name",
        "owner_drawings",
        "owner_advances",
        "owner_capital",
        "computed_pl",
        "computed_bs",
        "blue_deduction",
        "income_after",
        "cogs",
      ]),
      account_name: z.string().optional(),
    }),
  ),
});

export type BlueReturnLine = {
  id: string;
  print: string;
  label: string;
  section: "pl" | "bs";
  amount_yen: number | null;
};

export type BlueDeductionGate = {
  books_ready: boolean;
  eligible_yen: number;
  applied_yen: number;
};

export type SolePropBlueReturnDraft = {
  status: "ready" | "blocked";
  submission: "not-for-etax";
  corporate_tax_is_primary: false;
  headline: string;
  blockers: string[];
  disclaimer: string;
  inventory: "none" | "counted" | "undeclared";
  lines: BlueReturnLine[];
  income_before_blue_deduction_yen: number | null;
  bs_income_before_blue_deduction_yen: number | null;
  income_yen: number | null;
  cogs_yen: number | null;
  deduction_gate: BlueDeductionGate;
};

const DISCLAIMER = "提出しない。国税庁様式の提出用データではない。";

export function assessBlueReturnDeduction(input: {
  businessIncomeYen: number;
  doubleEntry?: boolean;
  hasBalanceSheet?: boolean;
  hasProfitAndLoss?: boolean;
  etaxSubmittedAt?: string | null;
  denshiYuryoNotifiedAt?: string | null;
}): BlueDeductionGate {
  const booksReady = Boolean(
    input.doubleEntry && input.hasBalanceSheet && input.hasProfitAndLoss,
  );
  if (!booksReady) return { books_ready: false, eligible_yen: 0, applied_yen: 0 };
  const electronic = Boolean(input.etaxSubmittedAt || input.denshiYuryoNotifiedAt);
  const eligible = electronic
    ? BLUE_RETURN_DEDUCTION_CAP_YEN.electronic
    : BLUE_RETURN_DEDUCTION_CAP_YEN.standard;
  const applied = Math.min(eligible, Math.max(0, input.businessIncomeYen));
  return { books_ready: true, eligible_yen: eligible, applied_yen: applied };
}

function lineMapPath(): string {
  return join(
    getInstallRoot(),
    "steward/jurisdiction-packs/JP/modules/jp_tax_individual/seed/blue-return-line-map.yaml.example",
  );
}

function blocked(blockers: string[]): SolePropBlueReturnDraft {
  return {
    status: "blocked",
    submission: "not-for-etax",
    corporate_tax_is_primary: false,
    headline: "青色申告決算書は未完成",
    blockers,
    disclaimer: DISCLAIMER,
    inventory: "undeclared",
    lines: [],
    income_before_blue_deduction_yen: null,
    bs_income_before_blue_deduction_yen: null,
    income_yen: null,
    cogs_yen: null,
    deduction_gate: { books_ready: false, eligible_yen: 0, applied_yen: 0 },
  };
}

function returnMethod(): "blue" | "white" | null {
  const path = join(getDataDir(), "finance", "sole-prop-return.yaml");
  if (!existsSync(path)) return null;
  const raw = YAML.parse(readFileSync(path, "utf-8")) as { return_method?: string };
  if (raw?.return_method === "blue" || raw?.return_method === "white") return raw.return_method;
  return null;
}

function filingEvidence(): { etaxSubmittedAt: string | null; denshiYuryoNotifiedAt: string | null } {
  const path = join(getDataDir(), "finance", "blue-return-filing.yaml");
  if (!existsSync(path)) return { etaxSubmittedAt: null, denshiYuryoNotifiedAt: null };
  const raw = YAML.parse(readFileSync(path, "utf-8")) as {
    etax_submitted_at?: string;
    denshi_yuryo_notified_at?: string;
  };
  return {
    etaxSubmittedAt: raw?.etax_submitted_at ?? null,
    denshiYuryoNotifiedAt: raw?.denshi_yuryo_notified_at ?? null,
  };
}

type Inventory =
  | { status: "undeclared" }
  | { status: "none" }
  | { status: "counted"; beginningYen: number; endingYen: number };

function loadInventory(): Inventory | { status: "invalid" } {
  const path = join(getDataDir(), "finance", "blue-return-inventory.yaml");
  if (!existsSync(path)) return { status: "undeclared" };
  const raw = YAML.parse(readFileSync(path, "utf-8")) as {
    status?: string;
    beginning_yen?: number;
    ending_yen?: number;
  };
  if (raw?.status === "none") return { status: "none" };
  if (raw?.status === "counted") {
    if (typeof raw.beginning_yen !== "number" || typeof raw.ending_yen !== "number") {
      return { status: "invalid" };
    }
    return { status: "counted", beginningYen: raw.beginning_yen, endingYen: raw.ending_yen };
  }
  return { status: "invalid" };
}

function inFiscalYear(date: string, fiscalYear: string): boolean {
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const start = fiscalYearStartDate(fiscalYear, endMonth);
  const end = fiscalYearEndDate(fiscalYear, endMonth);
  return date >= start && date <= end;
}

/** Books flags default to false. A draft must not claim them without ledger evidence. */
export function deriveSolePropBooksFlags(input: {
  entries: ReadonlyArray<{ lines: ReadonlyArray<{ debit_yen: number; credit_yen: number }> }>;
  ownerCapitalCode: string | undefined;
  formHasProfitAndLoss: boolean;
  formHasBalanceSheet: boolean;
}): { doubleEntry: boolean; hasBalanceSheet: boolean; hasProfitAndLoss: boolean } {
  const doubleEntry =
    input.entries.length > 0 &&
    input.entries.every((entry) => {
      let debit = 0;
      let credit = 0;
      for (const line of entry.lines) {
        debit += line.debit_yen;
        credit += line.credit_yen;
      }
      return debit === credit && debit > 0;
    });
  return {
    doubleEntry,
    hasProfitAndLoss: doubleEntry && input.formHasProfitAndLoss,
    hasBalanceSheet: doubleEntry && input.formHasBalanceSheet && Boolean(input.ownerCapitalCode),
  };
}

export function buildSolePropBlueReturn(fiscalYear: string): SolePropBlueReturnDraft {
  if (!isSoleProprietorship()) return blocked(["sole proprietorship entity_form is required"]);
  const method = returnMethod();
  if (!method) return blocked(["青色か白色の選択がありません"]);
  if (method === "white") return blocked(["白色申告の決算書は未実装"]);

  const mapFile = lineMapPath();
  if (!existsSync(mapFile)) return blocked(["blue return line map missing"]);
  const map = lineMapSchema.parse(YAML.parse(readFileSync(mapFile, "utf-8")));
  const inventory = loadInventory();
  if (inventory.status === "invalid") return blocked(["inventory declaration invalid"]);

  const coa = loadChartOfAccounts();
  const sources = resolveJournalSourceAccounts(coa);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = fiscalYearEndDate(fiscalYear, endMonth);
  let sales = 0;
  let mappedExpense = new Map<string, number>();
  let purchases = 0;
  for (const entry of loadJournalEntries().entries) {
    if (entry.source?.kind === "closing" && entry.source.adjustment_id === "pl-transfer") continue;
    const date = entry.occurred_at.slice(0, 10);
    if (!inFiscalYear(date, fiscalYear)) continue;
    for (const line of entry.lines) {
      const account = coa.accounts.find((item) => item.code === line.account_code);
      if (!account) continue;
      if (account.type === "revenue") sales += line.credit_yen - line.debit_yen;
      if (account.type === "expense") {
        const amount = line.debit_yen - line.credit_yen;
        if (account.name === "仕入高") purchases += amount;
        else mappedExpense.set(account.name, (mappedExpense.get(account.name) ?? 0) + amount);
      }
    }
  }

  const cogs =
    inventory.status === "counted" ? inventory.beginningYen + purchases - inventory.endingYen : null;
  if (cogs != null && cogs < 0) return blocked(["inventory cogs is negative"]);

  const expenseTotal = [...mappedExpense.values()].reduce((sum, amount) => sum + amount, 0);
  const plIncome = sales - expenseTotal - (cogs ?? 0);
  const trial = buildTrialBalance({ asOf });
  let openPl = 0;
  for (const row of trial.rows) {
    const account = coa.accounts.find((item) => item.code === row.account_code);
    if (!account) continue;
    if (account.type === "revenue") openPl += row.balance_yen;
    if (account.type === "expense") openPl -= row.balance_yen;
  }
  let transferred = 0;
  const yearEntries: Array<{ lines: Array<{ debit_yen: number; credit_yen: number }> }> = [];
  for (const entry of loadJournalEntries().entries) {
    const date = entry.occurred_at.slice(0, 10);
    if (!inFiscalYear(date, fiscalYear)) continue;
    yearEntries.push(entry);
    if (!(entry.source?.kind === "closing" && entry.source.adjustment_id === "pl-transfer")) continue;
    for (const line of entry.lines) {
      if (line.account_code !== sources.owner_capital) continue;
      transferred += line.credit_yen - line.debit_yen;
    }
  }
  const bookIncome = transferred + openPl;
  const bsIncome = bookIncome - (cogs ?? 0);
  if (plIncome !== bsIncome) {
    return {
      ...blocked(["profit and loss income does not match the balance-sheet income"]),
      inventory: inventory.status,
      income_before_blue_deduction_yen: plIncome,
      bs_income_before_blue_deduction_yen: bsIncome,
      cogs_yen: inventory.status === "undeclared" ? null : cogs,
    };
  }

  if (inventory.status === "undeclared") {
    return {
      ...blocked(["inventory is undeclared"]),
      inventory: "undeclared",
      cogs_yen: null,
      income_before_blue_deduction_yen: plIncome,
      bs_income_before_blue_deduction_yen: bsIncome,
    };
  }

  const evidence = filingEvidence();
  const books = deriveSolePropBooksFlags({
    entries: yearEntries,
    ownerCapitalCode: sources.owner_capital,
    formHasProfitAndLoss: map.lines.some((line) => line.section === "pl"),
    formHasBalanceSheet: map.lines.some((line) => line.section === "bs"),
  });
  const gate = assessBlueReturnDeduction({
    businessIncomeYen: plIncome,
    doubleEntry: books.doubleEntry,
    hasBalanceSheet: books.hasBalanceSheet,
    hasProfitAndLoss: books.hasProfitAndLoss,
    etaxSubmittedAt: evidence.etaxSubmittedAt,
    denshiYuryoNotifiedAt: evidence.denshiYuryoNotifiedAt,
  });
  const taken = gate.applied_yen;
  if (taken > 0 && taken > plIncome) return blocked(["blue deduction exceeds business income"]);

  const amountFor = (source: string, accountName?: string): number | null => {
    if (source === "revenue") return sales;
    if (source === "account_name") return mappedExpense.get(accountName ?? "") ?? 0;
    if (source === "cogs") return cogs;
    if (source === "computed_pl") return plIncome;
    if (source === "computed_bs") return bsIncome;
    if (source === "blue_deduction") return taken;
    if (source === "income_after") return plIncome - taken;
    if (source === "owner_drawings") return balanceOf(sources.owner_drawings, trial);
    if (source === "owner_advances") return balanceOf(sources.owner_advances, trial);
    if (source === "owner_capital") return openingCapitalYen(sources.owner_capital, trial, transferred);
    return null;
  };

  const lines: BlueReturnLine[] = map.lines.map((line) => ({
    id: line.id,
    print: line.print,
    label: line.label,
    section: line.section,
    amount_yen: amountFor(line.source, line.account_name),
  }));

  return {
    status: "ready",
    submission: "not-for-etax",
    corporate_tax_is_primary: false,
    headline: `青色申告決算書ドラフト ${fiscalYear}（提出しない）`,
    blockers: [],
    disclaimer: DISCLAIMER,
    inventory: inventory.status,
    lines,
    income_before_blue_deduction_yen: plIncome,
    bs_income_before_blue_deduction_yen: bsIncome,
    income_yen: plIncome - taken,
    cogs_yen: cogs,
    deduction_gate: gate,
  };
}

function balanceOf(
  code: string | undefined,
  trial: ReturnType<typeof buildTrialBalance>,
): number | null {
  if (!code) return null;
  return trial.rows.find((row) => row.account_code === code)?.balance_yen ?? 0;
}

/** 元入金 on the general-use form is opening capital, not the post-close balance. */
function openingCapitalYen(
  code: string | undefined,
  trial: ReturnType<typeof buildTrialBalance>,
  transferredNet: number,
): number | null {
  const closing = balanceOf(code, trial);
  if (closing == null) return null;
  return closing - transferredNet;
}
