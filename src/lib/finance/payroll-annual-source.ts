/** Actual annual payroll evidence. Plans and monthly estimates are not annual receipts. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import YAML from "yaml";
import { getDataDir } from "../utils.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";

const yen = z.number().int().nonnegative().safe();
export const annualPayrollSourceSchema = z.object({
  version: z.literal(1),
  calendar_year: z.string().regex(/^\d{4}$/),
  currency: z.literal("JPY"),
  employees: z
    .array(
      z.object({
        employee_id: z.string().min(1),
        coverage_months: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
        payments: z.array(
          z.object({
            journal_entry_id: z.string().min(1),
            payment_journal_entry_id: z.string().min(1),
            paid_on: z.string().date(),
            gross_yen: yen,
            withholding_yen: yen,
            social_employee_yen: yen,
            social_employer_yen: yen,
          })
        ),
      })
    )
    .min(1),
});

export function payrollCalendarYear(fiscalYear: string): string {
  if (!/^FY\d{4}$/.test(fiscalYear))
    throw new Error("Payroll calendar year requires FY#### (January to December)");
  return fiscalYear.slice(2);
}

export function readAnnualPayrollSource(fiscalYear: string) {
  const year = payrollCalendarYear(fiscalYear);
  const path = join(getDataDir(), "finance", "payroll-annual-source", `${year}.yaml`);
  if (!existsSync(path)) return null;
  const source = annualPayrollSourceSchema.parse(YAML.parse(readFileSync(path, "utf8")));
  if (source.calendar_year !== year) throw new Error("Annual payroll source year mismatch");
  const accounts = resolveJournalSourceAccounts();
  const journals = loadJournalEntries().entries;
  const seenIds = new Set<string>();
  const seenEmployees = new Set<string>();
  const seenPayments = new Set<string>();
  const proof: unknown[] = [];
  const employees = source.employees.map((employee) => {
    if (seenEmployees.has(employee.employee_id))
      throw new Error("Duplicate annual payroll employee");
    seenEmployees.add(employee.employee_id);
    const months = new Set(employee.coverage_months);
    if (
      months.size !== 12 ||
      employee.coverage_months.length !== 12 ||
      [...months].some((m) => !m.startsWith(`${year}-`))
    )
      throw new Error(
        "Annual payroll requires explicit coverage of all twelve calendar months, including unpaid months"
      );
    let gross = 0,
      withholding = 0,
      social = 0;
    for (const payment of employee.payments) {
      if (!payment.paid_on.startsWith(`${year}-`))
        throw new Error("Payment outside payroll calendar year");
      if (seenIds.has(payment.journal_entry_id))
        throw new Error("Payroll journal allocated more than once");
      seenIds.add(payment.journal_entry_id);
      const entry = journals.find((e) => e.entry_id === payment.journal_entry_id);
      if (!entry || entry.source?.kind !== "payroll" || !entry.occurred_at.startsWith(`${year}-`))
        throw new Error("Annual payroll journal/date mismatch");
      if (journals.some((e) => e.reversal_of === entry.entry_id))
        throw new Error("Reversed payroll cannot certify annual receipts");
      const credit = (code: string) =>
        entry.lines
          .filter((l) => l.account_code === code)
          .reduce((sum, l) => sum + l.credit_yen - l.debit_yen, 0);
      const net = payment.gross_yen - payment.withholding_yen - payment.social_employee_yen;
      if (
        net < 0 ||
        credit(accounts.withholding_payable) !== payment.withholding_yen ||
        credit(accounts.social_insurance_payable) !==
          payment.social_employee_yen + payment.social_employer_yen ||
        credit(accounts.payroll_payable) !== net ||
        -credit(accounts.payroll_expense) !== payment.gross_yen + payment.social_employer_yen
      )
        throw new Error("Annual payroll amounts do not reconcile to journal");
      const settlement = journals.find((e) => e.entry_id === payment.payment_journal_entry_id);
      if (
        !settlement ||
        seenPayments.has(settlement.entry_id) ||
        settlement.entry_id === entry.entry_id ||
        settlement.occurred_at.slice(0, 10) !== payment.paid_on ||
        settlement.occurred_at.slice(0, 10) < entry.occurred_at.slice(0, 10) ||
        journals.some((e) => e.reversal_of === settlement.entry_id)
      )
        throw new Error(
          "Annual payroll requires a distinct, unreversed payment journal on the payment date"
        );
      const settlementCredit = (code: string) =>
        settlement.lines
          .filter((l) => l.account_code === code)
          .reduce((sum, l) => sum + l.credit_yen - l.debit_yen, 0);
      if (
        -settlementCredit(accounts.payroll_payable) !== net ||
        settlementCredit(accounts.bank_control) !== net ||
        settlement.lines.some(
          (l) => ![accounts.payroll_payable, accounts.bank_control].includes(l.account_code)
        )
      )
        throw new Error("Annual payroll payment does not reconcile to net pay and bank");
      seenPayments.add(settlement.entry_id);
      proof.push(entry, settlement);
      gross += payment.gross_yen;
      withholding += payment.withholding_yen;
      social += payment.social_employee_yen;
    }
    return {
      employee_id: employee.employee_id,
      annual_gross_yen: gross,
      withholding_total_yen: withholding,
      social_employee_total_yen: social,
    };
  });
  // An omitted payroll entry must not silently disappear from the annual handoff.
  for (const entry of journals) {
    if (
      entry.source?.kind === "payroll" &&
      entry.occurred_at.startsWith(year) &&
      !seenIds.has(entry.entry_id) &&
      !seenPayments.has(entry.entry_id)
    )
      throw new Error(`Annual payroll source omits journal ${entry.entry_id}`);
  }
  return {
    employees,
    sha256: createHash("sha256").update(JSON.stringify({ source, proof })).digest("hex"),
  };
}
