import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTenantDir, setTenantId } from "../src/lib/tenant.js";
import { loadChartOfAccounts } from "../src/lib/data.js";
import {
  assessSolePropYearEnd,
  calendarMonthsInYear,
  isConsumptionTaxableStatus,
  reconcileWithholdingVsGl,
} from "../src/lib/finance/sole-prop-year-end.js";
import { postConsumptionTaxYearEndReclass } from "../src/lib/finance/consumption-tax-year-end.js";
import { appendJournalEntry, loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { journalEntrySchema } from "../schemas/finance/journal-entry.js";
import { unmappedBlueReturnExpenseCodes } from "../src/lib/finance/sole-proprietor-blue-return.js";

describe("sole-prop year-end process", () => {
  const setupRel = "data/finance/blue-return-setup.yaml";
  const journalRel = "data/finance/journal-entries.yaml";
  const whRel = "data/finance/withholding-payments.yaml";
  let setupBackup: string;
  let journalBackup: string;
  let whBackup: string;

  beforeEach(() => {
    setTenantId("_fixture-sole-prop");
    setupBackup = readFileSync(join(getTenantDir(), setupRel), "utf-8");
    journalBackup = readFileSync(join(getTenantDir(), journalRel), "utf-8");
    whBackup = readFileSync(join(getTenantDir(), whRel), "utf-8");
  });

  afterEach(() => {
    writeFileSync(join(getTenantDir(), setupRel), setupBackup, "utf-8");
    writeFileSync(join(getTenantDir(), journalRel), journalBackup, "utf-8");
    writeFileSync(join(getTenantDir(), whRel), whBackup, "utf-8");
  });

  it("lists Jan–Dec from books_start", () => {
    expect(calendarMonthsInYear(2026, "2026-01")).toHaveLength(12);
    expect(calendarMonthsInYear(2026, "2026-11")).toEqual(["2026-11", "2026-12"]);
  });

  it("treats 課税 as taxable and 免税 as not", () => {
    expect(isConsumptionTaxableStatus("課税事業者（本則）")).toBe(true);
    expect(isConsumptionTaxableStatus("免税事業者")).toBe(false);
  });

  it("warns on empty / unlocked months unless acknowledged", () => {
    writeFileSync(
      join(getTenantDir(), setupRel),
      setupBackup
        .replace(/\njournal_coverage:[\s\S]*$/m, "")
        .trimEnd() + "\n",
      "utf-8",
    );
    const warned = assessSolePropYearEnd(2026);
    expect(warned.empty_months.length).toBeGreaterThan(0);
    expect(warned.issues.some((i) => i.code === "journal_months_empty")).toBe(true);
    expect(warned.issues.some((i) => i.code === "period_locks_incomplete")).toBe(true);

    writeFileSync(
      join(getTenantDir(), setupRel),
      `${setupBackup.trimEnd()}\n`,
      "utf-8",
    );
    const acked = assessSolePropYearEnd(2026);
    expect(acked.issues.some((i) => i.code === "journal_months_empty")).toBe(false);
    expect(acked.issues.some((i) => i.code === "period_locks_incomplete")).toBe(false);
  });

  it("klab CoA maps consumption_tax_unpaid to 2180", () => {
    setTenantId("klab");
    const coa = loadChartOfAccounts();
    expect(coa.accounts.some((a) => a.code === "2180")).toBe(true);
    expect(coa.journal_source_accounts?.consumption_tax_unpaid).toBe("2180");
    setTenantId("_fixture-sole-prop");
  });

  it("posts VAT year-end reclass idempotently when taxable", () => {
    writeFileSync(
      join(getTenantDir(), setupRel),
      setupBackup.replace("status: 免税事業者", "status: 課税事業者（本則）"),
      "utf-8",
    );

    appendJournalEntry(
      journalEntrySchema.parse({
        entry_id: "JE-VAT-SEED-TEST",
        occurred_at: "2026-06-15T03:00:00.000Z",
        description: "vat seed for year-end test",
        source: { kind: "manual", authorized_by: "test" },
        evidence_refs: ["test:vat-seed"],
        lines: [
          {
            account_code: "1100",
            debit_yen: 1100,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 1000,
            tax_category: "taxable_10",
          },
          {
            account_code: "2160",
            debit_yen: 0,
            credit_yen: 100,
            tax_category: "out_of_scope",
          },
        ],
      }),
      { postedBy: "test" },
    );

    const first = postConsumptionTaxYearEndReclass({ calendarYear: 2026 });
    expect(first.posted).toBe(true);
    expect(first.entry_id).toBe("JE-CT-YE-2026");
    expect(loadJournalEntries().entries.some((e) => e.entry_id === first.entry_id)).toBe(
      true,
    );

    const second = postConsumptionTaxYearEndReclass({ calendarYear: 2026 });
    expect(second.posted).toBe(false);
    expect(second.skipped).toBe("already-posted");
  });

  it("year-end-status includes expected keys", () => {
    const s = assessSolePropYearEnd(2026);
    expect(s).toMatchObject({
      year: 2026,
      setup_ready: true,
    });
    expect(Array.isArray(s.empty_months)).toBe(true);
    expect(s.consumption).toHaveProperty("net_payable_yen");
    expect(s.withholding).toHaveProperty("delta_yen");
    expect(typeof s.withholding.delta_yen).toBe("number");
    expect(s.issues.every((i) => i.level === "warning")).toBe(true);
  });

  it("reconciles unpaid withholding as YAML minus remittance vs GL", () => {
    const r = reconcileWithholdingVsGl(2026);
    expect(r.expected_unpaid_yen).toBe(r.yaml_accrued_yen - r.remitted_yen);
    expect(r.delta_yen).toBe(r.expected_unpaid_yen - r.gl_unpaid_yen);
    expect(r.yaml_total_yen).toBe(r.yaml_accrued_yen);
    expect(r.gl_yen).toBe(r.gl_unpaid_yen);
  });

  it("treats remittance JEs as reducing expected unpaid withholding", () => {
    const setupPath = join(getTenantDir(), setupRel);
    const whPath = join(getTenantDir(), whRel);
    writeFileSync(
      setupPath,
      setupBackup.replace(
        "has_withholding_outsourcing: false",
        "has_withholding_outsourcing: true",
      ),
      "utf-8",
    );
    writeFileSync(
      whPath,
      `version: 1
calendar_year: 2026
payments:
  - payment_id: WP-2026-TEST
    payee_name: テスト外注
    category: reward_fee
    paid_at: "2026-06-10"
    gross_yen: 10000
    withholding_yen: 1021
    expense_account_code: "5100"
`,
      "utf-8",
    );

    const yamlOnly = assessSolePropYearEnd(2026);
    expect(yamlOnly.withholding.yaml_accrued_yen).toBe(1021);
    expect(yamlOnly.withholding.remitted_yen).toBe(0);
    expect(yamlOnly.issues.some((i) => i.code === "withholding_yaml_gl_mismatch")).toBe(
      true,
    );

    appendJournalEntry(
      journalEntrySchema.parse({
        entry_id: "JE-WH-ACCRUE-TEST",
        occurred_at: "2026-06-10T03:00:00.000Z",
        description: "withholding accrue test",
        source: { kind: "manual", authorized_by: "test" },
        evidence_refs: ["test:wh-accrue"],
        lines: [
          {
            account_code: "5100",
            debit_yen: 1021,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "2120",
            debit_yen: 0,
            credit_yen: 1021,
            tax_category: "out_of_scope",
          },
        ],
      }),
      { postedBy: "test" },
    );
    const accrued = reconcileWithholdingVsGl(2026);
    expect(accrued.expected_unpaid_yen).toBe(1021);
    expect(accrued.gl_unpaid_yen).toBe(1021);
    expect(accrued.delta_yen).toBe(0);
    expect(
      assessSolePropYearEnd(2026).issues.some((i) => i.code === "withholding_yaml_gl_mismatch"),
    ).toBe(false);

    appendJournalEntry(
      journalEntrySchema.parse({
        entry_id: "JE-WH-REMIT-TEST",
        occurred_at: "2026-07-10T03:00:00.000Z",
        description: "withholding remit test",
        source: {
          kind: "remittance",
          period: "2026-07",
          obligation: "withholding",
        },
        evidence_refs: ["test:wh-remit"],
        lines: [
          {
            account_code: "2120",
            debit_yen: 1021,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "1100",
            debit_yen: 0,
            credit_yen: 1021,
            tax_category: "out_of_scope",
          },
        ],
      }),
      { postedBy: "test" },
    );
    const afterRemit = reconcileWithholdingVsGl(2026);
    expect(afterRemit.remitted_yen).toBe(1021);
    expect(afterRemit.expected_unpaid_yen).toBe(0);
    expect(afterRemit.gl_unpaid_yen).toBe(0);
    expect(afterRemit.delta_yen).toBe(0);
  });

  it("warns expense CoA codes missing from blue-return map", () => {
    expect(unmappedBlueReturnExpenseCodes()).toContain("5210");
  });
});
