import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
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
function clearYearEndArtifacts() {
  for (const rel of [
    join("finance", "year-end-adjustment"),
    join("finance", "yea-declarations"),
    join("finance", "payroll-annual-source"),
  ]) {
    const path = join(getDataDir(), rel);
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }
}
function writeDeclaration() {
  const dir = join(getDataDir(), "finance", "yea-declarations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "FY2026.yaml"),
    YAML.stringify({
      version: 1,
      fiscal_year: "FY2026",
      employees: [
        {
          employee_id: "EMP-TEST",
          income_deductions_yen: 480000,
          tax_credits_yen: 0,
          other_income_yen: 0,
        },
      ],
    })
  );
}
function source(employeeId = "EMP-TEST") {
  const payments = months.map((period) => {
    const id = postPayrollJournalEntry({
      period,
      authorizedBy: "OP-TEST",
      employeeId,
      grossYen: 280000,
      withholdingYen: 5720,
      socialEmployeeYen: 41300,
      socialEmployerYen: 42280,
    });
    const paymentId = postPayrollPaymentJournalEntry({
      period,
      authorizedBy: "OP-TEST",
      employeeId,
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
    employees: [{ employee_id: employeeId, coverage_months: months, payments }],
  };
  const path = join(dir, "2026.yaml");
  writeFileSync(path, YAML.stringify(file));
  writeDeclaration();
  return { path, file };
}
describe("annual payroll evidence and posting", () => {
  beforeEach(() => {
    resetFixtureJournalEntries();
    clearYearEndArtifacts();
  });
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
      yea_settlement_yen: null,
    });
    expect(doc.blockers).toContain("actual_annual_payroll_missing");
    expect(() => markYearEndReadyForHandoff("FY2026")).toThrow("incomplete");
    expect(buildPayrollYearEndReadiness("FY2026").ready_for_tax_handoff).toBe(false);
  });
  it("reconciles all twelve actual payroll journals and hands off without computing settlement", () => {
    source();
    const doc = computeYearEndAdjustment("FY2026");
    expect(summarizeYearEndAdjustment(doc).totals.annual_gross_yen).toBe(3360000);
    expect(summarizeYearEndAdjustment(doc).totals.withholding_total_yen).toBe(68640);
    expect(typeof doc.employees[0]?.yea_settlement_yen).toBe("number");
    expect(typeof doc.employees[0]?.annual_tax_yen).toBe("number");
    expect(summarizeYearEndAdjustment(doc).calculation_complete).toBe(true);
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
  it("refuses multi-employee annual certification from company payroll journals", () => {
    const { path, file } = source();
    file.employees.push({
      employee_id: "EMP-OTHER",
      coverage_months: months,
      payments: file.employees[0]!.payments,
    });
    writeFileSync(path, YAML.stringify(file));
    expect(() => computeYearEndAdjustment("FY2026")).toThrow(
      /multiple employees|allocated more than once/
    );
  });
  it(
    "certifies two employees when each has employee-scoped payroll journals",
    () => {
      resetFixtureJournalEntries();
      clearYearEndArtifacts();
      const first = source("EMP-A");
      const secondPayments = months.map((period) => {
        const id = postPayrollJournalEntry({
          period,
          authorizedBy: "OP-TEST",
          employeeId: "EMP-B",
          grossYen: 280000,
          withholdingYen: 5720,
          socialEmployeeYen: 41300,
          socialEmployerYen: 42280,
        });
        const paymentId = postPayrollPaymentJournalEntry({
          period,
          authorizedBy: "OP-TEST",
          employeeId: "EMP-B",
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
      first.file.employees.push({
        employee_id: "EMP-B",
        coverage_months: months,
        payments: secondPayments,
      });
      writeFileSync(first.path, YAML.stringify(first.file));
      const dir = join(getDataDir(), "finance", "yea-declarations");
      writeFileSync(
        join(dir, "FY2026.yaml"),
        YAML.stringify({
          version: 1,
          fiscal_year: "FY2026",
          employees: [
            {
              employee_id: "EMP-A",
              income_deductions_yen: 480000,
              tax_credits_yen: 0,
              other_income_yen: 0,
            },
            {
              employee_id: "EMP-B",
              income_deductions_yen: 480000,
              tax_credits_yen: 0,
              other_income_yen: 0,
            },
          ],
        })
      );
      const doc = computeYearEndAdjustment("FY2026");
      expect(doc.employees).toHaveLength(2);
      expect(doc.blockers).toEqual([]);
    },
    60_000
  );
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
