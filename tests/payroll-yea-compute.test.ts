import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import YAML from "yaml";
import {
  computeYearEndAdjustment,
  summarizeYearEndAdjustment,
  markYearEndReadyForHandoff,
  buildPayrollYearEndReadiness,
  computeBonusDraft,
  saveBonusDraft,
  postBonusDraftJournal,
} from "../src/lib/finance/payroll-bonus-yea.js";
import {
  postPayrollJournalEntry,
  postPayrollPaymentJournalEntry,
} from "../src/lib/finance/journal-sources.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { resolveJournalSourceAccounts } from "../src/lib/finance/journal-source-accounts.js";
import { getDataDir } from "../src/lib/utils.js";
import { resetFixtureJournalEntries } from "./helpers/finance-fixture.js";

const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
function source() {
  const payments = months.map((period) => {
    const id = postPayrollJournalEntry({
      period,
      authorizedBy: "OP-TEST",
      grossYen: 280000,
      withholdingYen: 5720,
      socialEmployeeYen: 41300,
      socialEmployerYen: 42280,
    });
    const paymentId = postPayrollPaymentJournalEntry({
      period,
      authorizedBy: "OP-TEST",
      amountYen: 232980,
    })!;
    const paidOn = loadJournalEntries()
      .entries.find((e) => e.entry_id === paymentId)!
      .occurred_at.slice(0, 10);
    return {
      journal_entry_id: id,
      payment_journal_entry_id: paymentId,
      paid_on: paidOn,
      gross_yen: 280000,
      withholding_yen: 5720,
      social_employee_yen: 41300,
      social_employer_yen: 42280,
    };
  });
  const dir = join(getDataDir(), "finance", "payroll-annual-source");
  mkdirSync(dir, { recursive: true });
  const file = {
    version: 1,
    calendar_year: "2026",
    currency: "JPY",
    employees: [{ employee_id: "EMP-TEST", coverage_months: months, payments }],
  };
  const path = join(dir, "2026.yaml");
  writeFileSync(path, YAML.stringify(file));
  return { path, file };
}
describe("annual payroll evidence and posting", () => {
  beforeEach(() => resetFixtureJournalEntries());
  it("does not create records during readiness reads", () => {
    buildPayrollYearEndReadiness("FY2026");
    expect(existsSync(join(getDataDir(), "finance", "year-end-adjustment", "FY2026.yaml"))).toBe(
      false
    );
  });
  it("requires payment evidence distinct from accrual", () => {
    const { path, file } = source();
    file.employees[0]!.payments[0]!.payment_journal_entry_id =
      file.employees[0]!.payments[0]!.journal_entry_id;
    writeFileSync(path, YAML.stringify(file));
    expect(() => computeYearEndAdjustment("FY2026")).toThrow("payment journal");
  });
  it("does not substitute estimates or zero for missing annual records", () => {
    const doc = computeYearEndAdjustment("FY2026");
    expect(summarizeYearEndAdjustment(doc).totals).toEqual({
      annual_gross_yen: null,
      withholding_total_yen: null,
    });
    expect(doc.blockers).toContain("actual_annual_payroll_missing");
    expect(() => markYearEndReadyForHandoff("FY2026")).toThrow("incomplete");
    expect(buildPayrollYearEndReadiness("FY2026").ready_for_tax_handoff).toBe(false);
  });
  it("reconciles all twelve actual payroll journals and hands off without computing settlement", () => {
    source();
    const doc = computeYearEndAdjustment("FY2026");
    expect(summarizeYearEndAdjustment(doc).totals).toEqual({
      annual_gross_yen: 3360000,
      withholding_total_yen: 68640,
    });
    expect(doc.employees[0]?.yea_settlement_yen).toBeUndefined();
    expect(markYearEndReadyForHandoff("FY2026").status).toBe("ready_for_handoff");
    expect(buildPayrollYearEndReadiness("FY2026").ready_for_tax_handoff).toBe(true);
    expect(() => computeYearEndAdjustment("FY2026")).toThrow("cannot be overwritten");
  });
  it("rejects changing the declared payment date without matching settlement", () => {
    const { path, file } = source();
    file.employees[0]!.payments[0]!.paid_on = "2026-01-30";
    writeFileSync(path, YAML.stringify(file));
    expect(() => computeYearEndAdjustment("FY2026")).toThrow("payment journal");
  });
  it("rejects incomplete coverage and mismatched amounts", () => {
    const { path, file } = source();
    file.employees[0]!.coverage_months = months.slice(1);
    writeFileSync(path, YAML.stringify(file));
    expect(() => computeYearEndAdjustment("FY2026")).toThrow("twelve");
    file.employees[0]!.coverage_months = months;
    file.employees[0]!.payments[0]!.withholding_yen = 0;
    writeFileSync(path, YAML.stringify(file));
    expect(() => computeYearEndAdjustment("FY2026")).toThrow("do not reconcile");
  });
  it("invalidates handoff when source changes", () => {
    const { path, file } = source();
    computeYearEndAdjustment("FY2026");
    markYearEndReadyForHandoff("FY2026");
    file.employees[0]!.payments.pop();
    writeFileSync(path, YAML.stringify(file));
    expect(buildPayrollYearEndReadiness("FY2026").ready_for_tax_handoff).toBe(false);
  });
  it("deducts employee social insurance from payroll payable", () => {
    postPayrollJournalEntry({
      period: "2026-09",
      authorizedBy: "OP-TEST",
      grossYen: 280000,
      withholdingYen: 5720,
      socialEmployeeYen: 41300,
      socialEmployerYen: 42280,
    });
    const a = resolveJournalSourceAccounts(),
      e = loadJournalEntries().entries[0]!;
    expect(e.lines.find((l) => l.account_code === a.payroll_payable)?.credit_yen).toBe(232980);
    expect(e.lines.find((l) => l.account_code === a.social_insurance_payable)?.credit_yen).toBe(
      83580
    );
    expect(e.lines.reduce((s, l) => s + l.debit_yen - l.credit_yen, 0)).toBe(0);
  });
  it("does not guess bonus tax and preserves both social burdens", () => {
    expect(() => computeBonusDraft({ period: "2026-12", grossYen: 500000 })).toThrow("explicit");
    const run = computeBonusDraft({
      period: "2026-12",
      employeeId: "EMP-TEST",
      grossYen: 500000,
      withholdingYen: 40000,
      socialEmployeeYen: 70000,
      socialEmployerYen: 75000,
      evidenceRefs: ["test:verified-bonus"],
    });
    expect(run.net_yen).toBe(390000);
    saveBonusDraft(run);
    postBonusDraftJournal({ runId: run.run_id, authorizedBy: "OP-TEST" });
    const a = resolveJournalSourceAccounts(),
      e = loadJournalEntries().entries[0]!;
    expect(e.lines.find((l) => l.account_code === a.payroll_payable)?.credit_yen).toBe(390000);
    expect(e.lines.reduce((s, l) => s + l.debit_yen - l.credit_yen, 0)).toBe(0);
  });
  it("rejects an unsafe year path without writing", () => {
    expect(() => computeYearEndAdjustment("../../other")).toThrow("FY####");
  });
});
