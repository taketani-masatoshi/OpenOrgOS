import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendJournalEntry,
  loadJournalEntries,
} from "../src/lib/finance/expense-claim-journal.js";
import {
  closeAccountingYear,
  annualCloseTransactionPath,
  listFiscalYearMonths,
  proposedOpeningBalancesPath,
} from "../src/lib/finance/annual-close.js";
import { loadChartOfAccounts } from "../src/lib/data.js";
import { resolveCompanyFiscalYearEndMonth } from "../src/lib/finance/fiscal-year.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { loadOpeningBalances } from "../src/lib/finance/ledger/opening-balance.js";
import { closeAccountingMonth } from "../src/lib/finance/monthly-close.js";
import { isMonthLocked, lockMonth, unlockMonth } from "../src/lib/finance/period-lock.js";
import { getDataDir } from "../src/lib/utils.js";
import { openingBalancesSchema } from "../schemas/finance/opening-balances.js";
import { parse as parseYaml } from "yaml";
import {
  applyFixtureStatementRoles,
  injectRawJournalEntry,
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

const FY = "FY2026";
const OPERATOR = "OP-TEST";
let openingBackup = "";
let assetsBackup = "";
let extraMonthly: string[] = [];

function seedCloseInputs(months: string[]): void {
  const finance = join(getDataDir(), "finance");
  const rows = months
    .map(
      (month) =>
        `  - id: BS-${month}\n    date: "${month}-10"\n    direction: inflow\n    amount: 1\n    status: matched`,
    )
    .join("\n");
  writeFileSync(join(finance, "bank-statements.yaml"), `entries:\n${rows}\n`);
  writeFileSync(
    join(finance, `year-end.${FY}.yaml`),
    [
      `fiscal_year: ${FY}`,
      "inventory: none",
      "accruals: []",
      "subsequent_events:",
      "  status: none",
      "consumption_tax: exempt",
      "",
    ].join("\n"),
  );
  const assetsPath = join(finance, "fixed-assets.yaml");
  let assets = readFileSync(assetsPath, "utf-8");
  if (!assets.includes("tax_depreciation_yen:")) {
    assets = assets.replace(
      "book_value: 4293618\n",
      "book_value: 4293618\n    tax_depreciation_yen: 106382\n",
    );
  }
  if (!assets.includes('as_of: "2026-01-31"')) {
    assets = assets.replace(/as_of: "[^"]+"/, 'as_of: "2026-01-31"');
  }
  writeFileSync(assetsPath, assets);
  extraMonthly = [];
  for (const month of months) {
    const path = join(finance, "monthly", `${month}.yaml`);
    if (!existsSync(path)) {
      writeFileSync(path, `month: "${month}"\nrevenue: []\nexpenses: []\n`);
      extraMonthly.push(path);
    }
  }
}

function removeOpeningProposals(): void {
  useFinanceFixtureTenant();
  const dir = join(getDataDir(), "finance");
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (
      name.startsWith("opening-balances.FY") ||
      name.startsWith("annual-close.FY") ||
      name.startsWith("year-end.FY")
    ) {
      unlinkSync(join(dir, name));
    }
  }
}

function lockPreparedYear(): string[] {
  useFinanceFixtureTenant();
  const months = listFiscalYearMonths(FY, resolveCompanyFiscalYearEndMonth());
  seedCloseInputs(months);
  for (const month of months) {
    const closed = closeAccountingMonth({ month, operatorId: OPERATOR });
    expect(closed.evaluation.errors, month).toEqual([]);
    expect(closed.locked, month).toBe(true);
  }
  return months;
}

describe("annual close acceptance", () => {
  beforeEach(() => {
    resetFixtureJournalEntries();
    applyFixtureStatementRoles();
    removeOpeningProposals();
    openingBackup = readFileSync(join(getDataDir(), "finance", "opening-balances.yaml"), "utf-8");
    assetsBackup = readFileSync(join(getDataDir(), "finance", "fixed-assets.yaml"), "utf-8");
  });

  afterEach(() => {
    writeFileSync(join(getDataDir(), "finance", "opening-balances.yaml"), openingBackup);
    writeFileSync(join(getDataDir(), "finance", "fixed-assets.yaml"), assetsBackup);
    for (const path of extraMonthly) {
      if (existsSync(path)) unlinkSync(path);
    }
    const bank = join(getDataDir(), "finance", "bank-statements.yaml");
    if (existsSync(bank)) unlinkSync(bank);
    extraMonthly = [];
    removeOpeningProposals();
    resetFixtureJournalEntries();
  });

  it("transfers P/L once and switches the live opening file", () => {
    useFinanceFixtureTenant();
    const months = lockPreparedYear();
    const liveBefore = readFileSync(
      join(getDataDir(), "finance", "opening-balances.yaml"),
      "utf-8",
    );
    const asOfPreview = closeAccountingYear({
      fiscalYear: FY,
      operatorId: OPERATOR,
    });
    expect(asOfPreview.ok).toBe(true);

    const transferId = `JE-CLOSE-${FY}-PL-TRANSFER`;
    const firstIds = loadJournalEntries().entries.map((entry) => entry.entry_id);
    expect(firstIds.filter((id) => id === transferId)).toHaveLength(1);
    expect(asOfPreview.posted_entry_ids).toEqual([transferId]);
    const transfer = loadJournalEntries().entries.find((entry) => entry.entry_id === transferId);
    expect(transfer?.occurred_at.startsWith(`${asOfPreview.evaluation.as_of}T`)).toBe(true);
    expect(transfer?.source).toMatchObject({
      kind: "closing",
      adjustment_id: "pl-transfer",
      period: asOfPreview.evaluation.as_of.slice(0, 7),
    });

    const trial = buildTrialBalance({ asOf: asOfPreview.evaluation.as_of });
    const coa = loadChartOfAccounts();
    for (const row of trial.rows) {
      const account = coa.accounts.find((item) => item.code === row.account_code);
      if (account?.type === "revenue" || account?.type === "expense") {
        expect(Math.abs(row.balance_yen)).toBe(0);
      }
    }
    expect(readFileSync(join(getDataDir(), "finance", "opening-balances.yaml"), "utf-8")).not.toBe(
      liveBefore,
    );
    expect(loadOpeningBalances()?.fiscal_year).toBe(asOfPreview.evaluation.next_fiscal_year);
    expect(loadOpeningBalances()?.period_start).toBe(asOfPreview.evaluation.next_period_start);

    const proposalPath = proposedOpeningBalancesPath(asOfPreview.evaluation.next_fiscal_year);
    expect(asOfPreview.opening_proposal_path).toBe(proposalPath);
    expect(existsSync(proposalPath)).toBe(true);
    const proposal = openingBalancesSchema.parse(parseYaml(readFileSync(proposalPath, "utf-8")));
    expect(proposal.fiscal_year).toBe(asOfPreview.evaluation.next_fiscal_year);
    expect(proposal.period_start).toBe(asOfPreview.evaluation.next_period_start);
    expect(proposal.as_of).toBe(asOfPreview.evaluation.as_of);
    const debit = proposal.lines.reduce((sum, line) => sum + line.debit_yen, 0);
    const credit = proposal.lines.reduce((sum, line) => sum + line.credit_yen, 0);
    expect(debit).toBe(credit);
    for (const line of proposal.lines) {
      const account = coa.accounts.find((item) => item.code === line.account_code);
      expect(account?.type).not.toBe("revenue");
      expect(account?.type).not.toBe("expense");
    }

    const second = closeAccountingYear({
      fiscalYear: FY,
      operatorId: OPERATOR,
    });
    expect(second.ok).toBe(true);
    expect(second.posted_entry_ids).toEqual([]);
    expect(
      loadJournalEntries().entries.filter((entry) => entry.entry_id === transferId),
    ).toHaveLength(1);
    expect(months.every((month) => isMonthLocked(month))).toBe(true);
    const state = parseYaml(readFileSync(annualCloseTransactionPath(FY), "utf-8"));
    expect(state).toMatchObject({
      version: 1,
      fiscal_year: FY,
      phase: "committed",
      transfer_entry_id: transferId,
    });
    expect(state.opening_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      appendJournalEntry({
        entry_id: "JE-AFTER-ANNUAL",
        occurred_at: `${asOfPreview.evaluation.as_of}T12:00:00.000Z`,
        description: "ordinary post into locked final month",
        source: { kind: "manual", authorized_by: OPERATOR },
        evidence_refs: ["test:after-annual"],
        lines: [
          {
            account_code: "1100",
            debit_yen: 10,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 10,
            tax_category: "out_of_scope",
          },
        ],
      }),
    ).toThrow(/locked/);
  });

  it("writes nothing when a fiscal-year month is unlocked", () => {
    useFinanceFixtureTenant();
    const months = lockPreparedYear();
    const target = months[0]!;
    unlockMonth({ month: target, unlockedBy: OPERATOR, reason: "acceptance" });
    const live = readFileSync(join(getDataDir(), "finance", "opening-balances.yaml"), "utf-8");
    const before = loadJournalEntries().entries.map((entry) => entry.entry_id);
    const closed = closeAccountingYear({
      fiscalYear: FY,
      operatorId: OPERATOR,
    });
    expect(closed.ok).toBe(false);
    expect(closed.posted_entry_ids).toEqual([]);
    expect(closed.opening_proposal_path).toBeNull();
    expect(closed.evaluation.errors.some((issue) => issue.includes(`${target}: unlocked`))).toBe(
      true,
    );
    expect(loadJournalEntries().entries.map((entry) => entry.entry_id)).toEqual(before);
    expect(readFileSync(join(getDataDir(), "finance", "opening-balances.yaml"), "utf-8")).toBe(
      live,
    );
    expect(existsSync(proposedOpeningBalancesPath(closed.evaluation.next_fiscal_year))).toBe(false);
  });

  it("rejects a changed live opening after a committed annual close", () => {
    useFinanceFixtureTenant();
    lockPreparedYear();
    const first = closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR });
    expect(first.ok).toBe(true);
    writeFileSync(join(getDataDir(), "finance", "opening-balances.yaml"), openingBackup, "utf-8");
    expect(() => closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR })).toThrow(
      /committed artifacts changed/,
    );
  });

  it("resumes a committing annual close without duplicating the transfer", () => {
    useFinanceFixtureTenant();
    lockPreparedYear();
    const first = closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR });
    const statePath = annualCloseTransactionPath(FY);
    const state = parseYaml(readFileSync(statePath, "utf-8"));
    writeFileSync(
      statePath,
      `version: 1\n${Object.entries({
        ...state,
        version: undefined,
        phase: "committing",
      })
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n")}\n`,
    );
    unlinkSync(first.opening_proposal_path!);
    writeFileSync(join(getDataDir(), "finance", "opening-balances.yaml"), openingBackup, "utf-8");

    const resumed = closeAccountingYear({
      fiscalYear: FY,
      operatorId: OPERATOR,
    });
    expect(resumed.ok).toBe(true);
    expect(resumed.posted_entry_ids).toEqual([]);
    expect(existsSync(resumed.opening_proposal_path!)).toBe(true);
    expect(
      loadJournalEntries().entries.filter(
        (entry) => entry.entry_id === `JE-CLOSE-${FY}-PL-TRANSFER`,
      ),
    ).toHaveLength(1);
    expect(parseYaml(readFileSync(statePath, "utf-8")).phase).toBe("committed");
  });

  it("writes nothing when a month is relocked without valid close evidence", () => {
    useFinanceFixtureTenant();
    const months = lockPreparedYear();
    const finalMonth = months[months.length - 1]!;
    unlockMonth({
      month: finalMonth,
      unlockedBy: OPERATOR,
      reason: "inject imbalance",
    });
    injectRawJournalEntry({
      entry_id: "JE-BAD-TB",
      occurred_at: `${finalMonth}-15T00:00:00.000Z`,
      description: "unknown account",
      source: { kind: "manual", authorized_by: OPERATOR },
      evidence_refs: ["test:bad-tb"],
      lines: [
        {
          account_code: "9999",
          debit_yen: 100,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: "1100",
          debit_yen: 0,
          credit_yen: 100,
          tax_category: "out_of_scope",
        },
      ],
    });
    lockMonth({
      month: finalMonth,
      lockedBy: OPERATOR,
      reason: "relock unbalanced",
    });
    const live = readFileSync(join(getDataDir(), "finance", "opening-balances.yaml"), "utf-8");
    const before = loadJournalEntries().entries.map((entry) => entry.entry_id);
    const closed = closeAccountingYear({
      fiscalYear: FY,
      operatorId: OPERATOR,
    });
    expect(closed.ok).toBe(false);
    expect(closed.posted_entry_ids).toEqual([]);
    expect(closed.opening_proposal_path).toBeNull();
    expect(closed.evaluation.errors.some((issue) => issue.includes("close evidence missing"))).toBe(
      true,
    );
    expect(loadJournalEntries().entries.map((entry) => entry.entry_id)).toEqual(before);
    expect(readFileSync(join(getDataDir(), "finance", "opening-balances.yaml"), "utf-8")).toBe(
      live,
    );
    expect(existsSync(proposedOpeningBalancesPath(closed.evaluation.next_fiscal_year))).toBe(false);
  });
});
