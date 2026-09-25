if (process.env.ORGOS_TEST_DISPOSABLE_ROOT !== process.cwd())
  throw new Error("Use python3 scripts/run-finance-audit.py for disposable audit tests");
import { importBankStatementCsvText } from "../src/lib/finance/bank-statement-import-service.js";
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendJournalEntry,
  loadJournalEntries,
} from "../src/lib/finance/expense-claim-journal.js";
import {
  closeAccountingYear,
  evaluateAnnualCloseGates,
  annualCloseTransactionPath,
  listFiscalYearMonths,
} from "../src/lib/finance/annual-close.js";
import { resolveCompanyFiscalYearEndMonth } from "../src/lib/finance/fiscal-year.js";
import { closeAccountingMonth } from "../src/lib/finance/monthly-close.js";
import { getDataDir } from "../src/lib/utils.js";
import { parse as parseYaml } from "yaml";
import {
  applyFixtureStatementRoles,
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
        `  - id: BS-${month}\n    date: "${month}-10"\n    direction: inflow\n    amount: 1\n    status: matched`
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
    ].join("\n")
  );
  const assetsPath = join(finance, "fixed-assets.yaml");
  const assets = readFileSync(assetsPath, "utf-8");
  if (!assets.includes("tax_depreciation_yen:")) {
    writeFileSync(
      assetsPath,
      assets.replace(
        "book_value: 4293618\n",
        "book_value: 4293618\n    tax_depreciation_yen: 106382\n"
      )
    );
  }
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
    writeFileSync(
      join(getDataDir(), "finance", "monthly", `${month}.yaml`),
      `month: "${month}"\nrevenue: []\nexpenses: []\n`
    );
    appendJournalEntry({
      entry_id: `JE-SYNTHETIC-${month}`,
      occurred_at: `${month}-10T00:00:00.000Z`,
      description: "Synthetic sale",
      source: { kind: "manual", authorized_by: OPERATOR },
      evidence_refs: ["test:annual"],
      lines: [
        { account_code: "1100", debit_yen: 1000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 1000, tax_category: "taxable_10" },
      ],
    });
    const closed = closeAccountingMonth({
      month,
      operatorId: OPERATOR,
      postPayroll: false,
      postDepreciation: false,
    });
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

  it("A2: resumes after opening switch before commit marker", () => {
    lockPreparedYear();
    const first = closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR });
    expect(first.ok).toBe(true);
    const statePath = annualCloseTransactionPath(FY);
    const state = parseYaml(readFileSync(statePath, "utf8"));
    state.phase = "committing";
    // This is the real crash window: opening already switched, state not finalized.
    writeFileSync(statePath, JSON.stringify(state));
    const retry = closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR });
    expect(retry.ok).toBe(true);
    expect(parseYaml(readFileSync(statePath, "utf8")).phase).toBe("committed");
  });
  it("A3: rejects locked bank import and detects content changes", () => {
    lockPreparedYear();
    const bankPath = join(getDataDir(), "finance/bank-statements.yaml");
    const bank = parseYaml(readFileSync(bankPath, "utf8"));
    bank.entries = bank.entries.map((row: object) => ({
      category: "other",
      description: "synthetic",
      account_id: "BANK-001",
      ...row,
    }));
    writeFileSync(bankPath, JSON.stringify(bank));
    expect(() =>
      importBankStatementCsvText({
        csvText:
          "date,direction,amount,category,description,account_id,reference,counterparty\n2026-02-20,inflow,999,other,synthetic,BANK-001,AUDIT-NEW,SYNTHETIC\n",
      })
    ).toThrow("is locked");

    const evaluation = evaluateAnnualCloseGates(FY);
    expect(evaluation.can_close).toBe(false);
  });

  it("A2: resumes before the opening switch without posting another transfer", () => {
    lockPreparedYear();
    const first = closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR });
    expect(first.ok).toBe(true);
    const statePath = annualCloseTransactionPath(FY);
    const state = parseYaml(readFileSync(statePath, "utf8"));
    state.phase = "committing";
    writeFileSync(
      join(getDataDir(), "finance", "opening-balances.yaml"),
      JSON.stringify(state.original_opening)
    );
    writeFileSync(statePath, JSON.stringify(state));
    const retry = closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR });
    expect(retry.ok).toBe(true);
    expect(retry.posted_entry_ids).toEqual([]);
    expect(
      loadJournalEntries().entries.filter((e) => e.entry_id === `JE-CLOSE-${FY}-PL-TRANSFER`)
    ).toHaveLength(1);
  });
  it("A2: refuses a modified proposal during recovery", () => {
    lockPreparedYear();
    expect(closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR }).ok).toBe(true);
    const statePath = annualCloseTransactionPath(FY);
    const state = parseYaml(readFileSync(statePath, "utf8"));
    state.phase = "committing";
    writeFileSync(statePath, JSON.stringify(state));
    const proposal = parseYaml(readFileSync(state.proposal_path, "utf8"));
    proposal.notes = "tampered";
    writeFileSync(state.proposal_path, JSON.stringify(proposal));
    expect(() => closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR })).toThrow(
      "artifacts changed"
    );
    expect(parseYaml(readFileSync(statePath, "utf8")).phase).toBe("committing");
  });
  it("A2: committed state cannot certify a restored old opening", () => {
    lockPreparedYear();
    expect(closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR }).ok).toBe(true);
    const state = parseYaml(readFileSync(annualCloseTransactionPath(FY), "utf8"));
    writeFileSync(
      join(getDataDir(), "finance", "opening-balances.yaml"),
      JSON.stringify(state.original_opening)
    );
    expect(() => closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR })).toThrow(
      "artifacts changed"
    );
  });
});
