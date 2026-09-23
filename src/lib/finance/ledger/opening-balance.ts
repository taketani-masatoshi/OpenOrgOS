import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  openingBalancesSchema,
  type OpeningBalancesFile,
} from "../../../../schemas/finance/opening-balances.js";
import { getDataDir, readYamlFile } from "../../utils.js";
import { buildTrialBalance } from "./trial-balance.js";
import { loadChartOfAccounts } from "../../data.js";

import { loadPeriodLocks } from "../period-lock.js";
import { withFinanceMutation } from "../reconciliation-transaction.js";
import { writeYamlFileAtomic } from "../../yaml-atomic.js";

const OPENING_REL = "finance/opening-balances.yaml";

export function openingBalancesPath(): string {
  return join(getDataDir(), OPENING_REL);
}

export function loadOpeningBalances(): OpeningBalancesFile | null {
  const path = openingBalancesPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, openingBalancesSchema);
}

export function saveOpeningBalances(file: OpeningBalancesFile): void {
  return withFinanceMutation(() => {
    const history = loadPeriodLocks().locks;
    if (history.length > 0)
      throw new Error(
        "Opening balances cannot be replaced after period close history; use annual close or controlled correction"
      );
    const parsed = openingBalancesSchema.parse(file);
    if (parsed.lines.reduce((s, l) => s + l.debit_yen - l.credit_yen, 0) !== 0)
      throw new Error("Opening balances must balance");
    mkdirSync(join(getDataDir(), "finance"), { recursive: true });
    writeYamlFileAtomic(openingBalancesPath(), parsed);
  });
}

/** Build next-period opening balances from trial balance as-of date. */
export function buildOpeningBalancesFromTrialBalance(input: {
  fiscalYear: string;
  asOf: string;
  periodStart: string;
  notes?: string;
  bsOnly?: boolean;
}): OpeningBalancesFile {
  const trial = buildTrialBalance({ asOf: input.asOf });
  const coa = input.bsOnly ? loadChartOfAccounts() : null;
  const lines = trial.rows
    .filter((row) => row.balance_yen !== 0)
    .filter((row) => {
      if (!input.bsOnly || !coa) return true;
      const account = coa.accounts.find((a) => a.code === row.account_code);
      if (!account) return true;
      return account.type !== "revenue" && account.type !== "expense";
    })
    .map((row) => {
      if (row.normal_balance === "debit") {
        return row.balance_yen >= 0
          ? {
              account_code: row.account_code,
              debit_yen: row.balance_yen,
              credit_yen: 0,
            }
          : {
              account_code: row.account_code,
              debit_yen: 0,
              credit_yen: -row.balance_yen,
            };
      }
      const creditBal = row.balance_yen;
      return creditBal >= 0
        ? {
            account_code: row.account_code,
            debit_yen: 0,
            credit_yen: creditBal,
          }
        : {
            account_code: row.account_code,
            debit_yen: -creditBal,
            credit_yen: 0,
          };
    });

  return openingBalancesSchema.parse({
    version: 1,
    fiscal_year: input.fiscalYear,
    period_start: input.periodStart,
    as_of: input.asOf,
    currency: "JPY",
    lines,
    notes: input.notes,
  });
}

export function openingBalanceIntegrityIssues(): string[] {
  const file = loadOpeningBalances();
  if (!file) return [];
  const issues: string[] = [];
  if (!file.period_start) {
    issues.push("opening-balances: period_start missing");
  }
  const debit = file.lines.reduce((s, l) => s + l.debit_yen, 0);
  const credit = file.lines.reduce((s, l) => s + l.credit_yen, 0);
  if (debit !== credit) {
    issues.push(`opening-balances: not balanced (debit=${debit} credit=${credit})`);
  }
  return issues;
}

/**
 * Opening lines must match the journal-only trial balance at opening.as_of
 * for balance-sheet accounts (P/L accounts are excluded from openings).
 */
export function openingBalancesReconcileIssues(): string[] {
  const file = loadOpeningBalances();
  if (!file) return [];
  const issues = openingBalanceIntegrityIssues();
  const books = buildTrialBalance({ asOf: file.as_of, includeOpening: false });
  const expectedLines = books.rows
    .filter((row) => row.balance_yen !== 0)
    .map((row) => {
      if (row.normal_balance === "debit") {
        return row.balance_yen >= 0
          ? {
              account_code: row.account_code,
              debit_yen: row.balance_yen,
              credit_yen: 0,
            }
          : {
              account_code: row.account_code,
              debit_yen: 0,
              credit_yen: -row.balance_yen,
            };
      }
      return row.balance_yen >= 0
        ? {
            account_code: row.account_code,
            debit_yen: 0,
            credit_yen: row.balance_yen,
          }
        : {
            account_code: row.account_code,
            debit_yen: -row.balance_yen,
            credit_yen: 0,
          };
    });
  const actual = new Map(
    file.lines.map((line) => [
      line.account_code,
      { debit: line.debit_yen, credit: line.credit_yen },
    ])
  );
  const expected = new Map(
    expectedLines.map((line) => [
      line.account_code,
      { debit: line.debit_yen, credit: line.credit_yen },
    ])
  );
  for (const [code, want] of expected) {
    const got = actual.get(code) ?? { debit: 0, credit: 0 };
    if (got.debit !== want.debit || got.credit !== want.credit) {
      issues.push(
        `opening ${code}: books debit=${want.debit}/credit=${want.credit} opening debit=${got.debit}/credit=${got.credit}`
      );
    }
  }
  for (const [code, got] of actual) {
    if (!expected.has(code) && (got.debit !== 0 || got.credit !== 0)) {
      issues.push(`opening ${code}: not present in books at ${file.as_of}`);
    }
  }
  return issues;
}
