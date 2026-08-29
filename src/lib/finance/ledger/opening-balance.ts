import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  openingBalancesSchema,
  type OpeningBalancesFile,
} from "../../../../schemas/finance/opening-balances.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../../utils.js";
import { buildTrialBalance } from "./trial-balance.js";
import { loadChartOfAccounts } from "../../data.js";

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
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(openingBalancesPath(), openingBalancesSchema.parse(file));
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
    issues.push(
      `opening-balances: not balanced (debit=${debit} credit=${credit})`,
    );
  }
  return issues;
}
