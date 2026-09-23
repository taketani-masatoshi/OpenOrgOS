import { assertJapaneseFinanceEngine } from "./jp-engine-guard.js";
/**
 * Bonus + year-end adjustment (YEA) skeleton for jp_payroll Phase 4+.
 * Full automation remains deferred (ADR 0043) — deterministic stubs for product surface.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";
import { getClock } from "../runtime-context.js";
import { loadPayroll } from "../data.js";
import { payrollCalendarYear, readAnnualPayrollSource } from "./payroll-annual-source.js";
import {
  computeAnnualSalarySettlement,
  readYeaDeclaration,
} from "./payroll-yea-settlement.js";
import { withFinanceMutation } from "./reconciliation-transaction.js";
import { writeYamlFileAtomic } from "../yaml-atomic.js";
import { appendJournalEntry } from "./expense-claim-journal.js";
import { postYearEndWithholdingSettlement } from "./journal-sources.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import { fiscalYearEndDate, resolveCompanyFiscalYearEndMonth } from "./fiscal-year.js";

const bonusRunSchema = z.object({
  version: z.literal(1),
  runs: z.array(
    z.object({
      run_id: z.string(),
      period: z.string(),
      employee_id: z.string().optional(),
      gross_yen: z.number().int().nonnegative().safe(),
      withholding_yen: z.number().int().nonnegative().safe(),
      social_yen: z.number().int().nonnegative(),
      social_employer_yen: z.number().int().nonnegative().optional(),
      calculation_basis: z.literal("explicit_verified_amounts").optional(),
      evidence_refs: z.array(z.string().min(1)).optional(),
      net_yen: z.number().int().nonnegative().safe(),
      status: z.enum(["draft", "posted", "paid"]),
      created_at: z.string(),
    })
  ),
});

const yeaSchema = z.object({
  version: z.literal(1),
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  source_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  blockers: z.array(z.string()).default([]),
  status: z.enum(["not_started", "in_progress", "ready_for_handoff", "closed"]),
  employees: z.array(
    z.object({
      employee_id: z.string(),
      annual_gross_yen: z.number().int().nonnegative().safe().optional(),
      withholding_total_yen: z.number().int().nonnegative().safe().optional(),
      social_employee_total_yen: z.number().int().nonnegative().safe().optional(),
      annual_tax_yen: z.number().int().nonnegative().safe().optional(),
      yea_settlement_yen: z.number().int().safe().optional(),
      settlement_journal_entry_id: z.string().optional(),
      note: z.string().optional(),
    })
  ),
  updated_at: z.string(),
});

function bonusPath(): string {
  return join(getDataDir(), "finance", "payroll-bonus-runs.yaml");
}

function yeaPath(fiscalYear: string): string {
  payrollCalendarYear(fiscalYear);
  return join(getDataDir(), "finance", "year-end-adjustment", `${fiscalYear}.yaml`);
}

export function computeBonusDraft(input: {
  period: string;
  grossYen: number;
  employeeId?: string;
  withholdingYen?: number;
  socialEmployeeYen?: number;
  socialEmployerYen?: number;
  evidenceRefs?: string[];
}): z.infer<typeof bonusRunSchema>["runs"][number] {
  assertJapaneseFinanceEngine();
  const withholding = input.withholdingYen;
  const social = input.socialEmployeeYen;
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period) ||
    !input.employeeId ||
    !input.evidenceRefs?.length ||
    ![input.grossYen, withholding, social, input.socialEmployerYen].every(
      (n) => Number.isSafeInteger(n) && n! >= 0
    ) ||
    withholding === undefined ||
    social === undefined
  )
    throw new Error("Bonus requires employee, period, explicit tax/social amounts and evidence");
  if (withholding + social > input.grossYen) throw new Error("Bonus deductions exceed gross");
  return {
    run_id: `BONUS-${input.period}-${randomUUID().toUpperCase()}`,
    period: input.period,
    employee_id: input.employeeId,
    gross_yen: input.grossYen,
    withholding_yen: withholding,
    social_yen: social,
    net_yen: input.grossYen - withholding - social,
    social_employer_yen: input.socialEmployerYen,
    calculation_basis: "explicit_verified_amounts",
    evidence_refs: input.evidenceRefs,
    status: "draft",
    created_at: getClock().now().toISOString(),
  };
}

export function saveBonusDraft(run: ReturnType<typeof computeBonusDraft>): void {
  return withFinanceMutation(() => saveBonusDraftInner(run));
}
function saveBonusDraftInner(run: ReturnType<typeof computeBonusDraft>): void {
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  const path = bonusPath();
  const file = existsSync(path)
    ? bonusRunSchema.parse(YAML.parse(readFileSync(path, "utf-8")))
    : { version: 1 as const, runs: [] };
  if (run.status !== "draft" || file.runs.some((r) => r.run_id === run.run_id))
    throw new Error("Bonus draft must be new and unposted");
  file.runs.push(run);
  writeYamlFileAtomic(path, bonusRunSchema.parse(file));
}

/** Post a bonus draft run as a GL journal (skeleton — Phase 4+ full payroll). */
export function postBonusDraftJournal(input: { runId: string; authorizedBy: string }): {
  entry_id: string;
  run_id: string;
} {
  return withFinanceMutation(() => postBonusDraftJournalInner(input));
}
function postBonusDraftJournalInner(input: { runId: string; authorizedBy: string }): {
  entry_id: string;
  run_id: string;
} {
  const path = bonusPath();
  if (!existsSync(path)) {
    throw new Error("payroll-bonus-runs.yaml missing — create a bonus draft first");
  }
  const file = bonusRunSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
  const run = file.runs.find((row) => row.run_id === input.runId);
  if (!run) throw new Error(`bonus run not found: ${input.runId}`);
  if (run.status === "posted" || run.status === "paid") {
    throw new Error(`bonus run already ${run.status}`);
  }

  if (
    run.calculation_basis !== "explicit_verified_amounts" ||
    run.social_employer_yen === undefined ||
    !run.evidence_refs?.length ||
    run.net_yen !== run.gross_yen - run.withholding_yen - run.social_yen
  )
    throw new Error("Legacy or inconsistent bonus draft must be recalculated with evidence");
  const accounts = resolveJournalSourceAccounts();
  const entryId = `JE-${run.run_id}`;
  const socialEmployee = run.social_yen;
  appendJournalEntry(
    {
      entry_id: entryId,
      occurred_at: `${run.period}-20T12:00:00.000Z`,
      description: `Bonus draft post ${run.run_id}`,
      source: { kind: "payroll", period: run.period },
      evidence_refs: [`bonus:${run.run_id}`, ...run.evidence_refs],
      lines: [
        {
          account_code: accounts.payroll_expense,
          debit_yen: run.gross_yen + run.social_employer_yen,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: accounts.withholding_payable,
          debit_yen: 0,
          credit_yen: run.withholding_yen,
          tax_category: "out_of_scope",
        },
        {
          account_code: accounts.social_insurance_payable,
          debit_yen: 0,
          credit_yen: socialEmployee + run.social_employer_yen,
          tax_category: "out_of_scope",
        },
        {
          account_code: accounts.payroll_payable,
          debit_yen: 0,
          credit_yen: run.net_yen,
          tax_category: "out_of_scope",
        },
      ],
    },
    { postedBy: input.authorizedBy }
  );

  run.status = "posted";
  writeYamlFileAtomic(path, file);
  return { entry_id: entryId, run_id: run.run_id };
}

export function loadOrInitYearEndAdjustment(fiscalYear: string) {
  const path = yeaPath(fiscalYear);
  if (existsSync(path)) {
    return yeaSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
  }
  const doc = yeaSchema.parse({
    version: 1,
    fiscal_year: fiscalYear,
    status: "not_started",
    employees: [],
    updated_at: getClock().now().toISOString(),
  });
  return doc;
}

/** Annual handoff uses recorded payments, never monthly plan times twelve. */
export function computeYearEndAdjustment(fiscalYear: string) {
  return withFinanceMutation(() => {
    assertJapaneseFinanceEngine();
    payrollCalendarYear(fiscalYear);
    const path = yeaPath(fiscalYear);
    if (existsSync(path)) {
      const previous = yeaSchema.parse(YAML.parse(readFileSync(path, "utf8")));
      if (["closed", "ready_for_handoff"].includes(previous.status))
        throw new Error("Finalized annual payroll cannot be overwritten by compute");
    }
    const actual = readAnnualPayrollSource(fiscalYear);
    const declaration = readYeaDeclaration(fiscalYear);
    const payroll = actual ? null : loadPayroll();
    const ids = actual
      ? []
      : [
          ...(payroll?.employee_payroll?.employee_ids ?? []),
          ...(payroll?.officers ?? []).flatMap((o) => (o.employee_id ? [o.employee_id] : [])),
        ];
    const blockers: string[] = [];
    if (!actual) blockers.push("actual_annual_payroll_missing");
    if (actual && !declaration) blockers.push("yea_declaration_missing");
    const employees =
      actual?.employees.map((row) => {
        const declared = declaration?.employees.find((d) => d.employee_id === row.employee_id);
        if (!declared) {
          blockers.push(`yea_declaration_missing:${row.employee_id}`);
          return {
            employee_id: row.employee_id,
            annual_gross_yen: row.annual_gross_yen,
            withholding_total_yen: row.withholding_total_yen,
            social_employee_total_yen: row.social_employee_total_yen,
            note: "YEA declaration missing for settlement",
          };
        }
        const settlement = computeAnnualSalarySettlement({
          fiscalYear,
          employeeId: row.employee_id,
          annualGrossYen: row.annual_gross_yen,
          socialEmployeeTotalYen: row.social_employee_total_yen,
          withholdingTotalYen: row.withholding_total_yen,
          incomeDeductionsYen: declared.income_deductions_yen,
          taxCreditsYen: declared.tax_credits_yen,
          otherIncomeYen: declared.other_income_yen,
        });
        const occurredAt = `${fiscalYearEndDate(fiscalYear, resolveCompanyFiscalYearEndMonth())}T12:00:00.000Z`;
        const settlementId =
          settlement.yea_settlement_yen === 0
            ? undefined
            : postYearEndWithholdingSettlement({
                fiscalYear,
                employeeId: row.employee_id,
                settlementYen: settlement.yea_settlement_yen,
                authorizedBy: "yea-compute",
                occurredAt,
              });
        return {
          employee_id: row.employee_id,
          annual_gross_yen: row.annual_gross_yen,
          withholding_total_yen: row.withholding_total_yen,
          social_employee_total_yen: row.social_employee_total_yen,
          annual_tax_yen: settlement.annual_tax_yen,
          yea_settlement_yen: settlement.yea_settlement_yen,
          settlement_journal_entry_id: settlementId,
        };
      }) ??
      [...new Set(ids)].map((employee_id) => ({
        employee_id,
        note: "Annual receipts and withholding unavailable; payroll plan not substituted",
      }));
    const next = yeaSchema.parse({
      version: 1,
      fiscal_year: fiscalYear,
      status: "in_progress",
      source_sha256: actual?.sha256,
      blockers: [...new Set(blockers)],
      employees,
      updated_at: getClock().now().toISOString(),
    });
    mkdirSync(join(path, ".."), { recursive: true });
    writeYamlFileAtomic(path, next);
    return next;
  });
}

/** Chat / Console 向け集計。個人別明細は YAML（gitignore）のみ。 */
export function summarizeYearEndAdjustment(yea: z.infer<typeof yeaSchema>) {
  const settlementReady =
    yea.blockers.length === 0 &&
    yea.employees.length > 0 &&
    yea.employees.every(
      (row) =>
        row.annual_gross_yen !== undefined &&
        row.withholding_total_yen !== undefined &&
        row.annual_tax_yen !== undefined &&
        row.yea_settlement_yen !== undefined
    );
  return {
    fiscal_year: yea.fiscal_year,
    status: yea.status,
    employee_count: yea.employees.length,
    blockers: yea.blockers,
    calculation_complete: settlementReady,
    totals: {
      annual_gross_yen:
        yea.blockers.length ||
        yea.employees.length === 0 ||
        yea.employees.some((row) => row.annual_gross_yen === undefined)
          ? null
          : yea.employees.reduce((sum, row) => sum + row.annual_gross_yen!, 0),
      withholding_total_yen:
        yea.blockers.length ||
        yea.employees.length === 0 ||
        yea.employees.some((row) => row.withholding_total_yen === undefined)
          ? null
          : yea.employees.reduce((sum, row) => sum + row.withholding_total_yen!, 0),
      yea_settlement_yen: settlementReady
        ? yea.employees.reduce((sum, row) => sum + (row.yea_settlement_yen ?? 0), 0)
        : null,
    },
    note: "個人別明細は year-end-adjustment YAML（gitignore）。e-file 提出はしない。",
  };
}

function assertYearEndEvidence(doc: z.infer<typeof yeaSchema>): void {
  if (
    doc.blockers.length ||
    !doc.source_sha256 ||
    doc.employees.length === 0 ||
    doc.employees.some(
      (e) =>
        e.annual_gross_yen === undefined ||
        e.withholding_total_yen === undefined ||
        e.annual_tax_yen === undefined ||
        e.yea_settlement_yen === undefined
    )
  )
    throw new Error("Annual payroll actuals incomplete");
  const actual = readAnnualPayrollSource(doc.fiscal_year);
  if (
    !actual ||
    actual.sha256 !== doc.source_sha256 ||
    JSON.stringify(
      actual.employees.map(
        ({ employee_id, annual_gross_yen, withholding_total_yen, social_employee_total_yen }) => ({
          employee_id,
          annual_gross_yen,
          withholding_total_yen,
          social_employee_total_yen,
        })
      )
    ) !==
      JSON.stringify(
        doc.employees.map(
          ({
            employee_id,
            annual_gross_yen,
            withholding_total_yen,
            social_employee_total_yen,
          }) => ({
            employee_id,
            annual_gross_yen,
            withholding_total_yen,
            social_employee_total_yen,
          })
        )
      )
  )
    throw new Error("Annual payroll evidence changed; recompute before handoff");
}
export function markYearEndReadyForHandoff(fiscalYear: string) {
  return withFinanceMutation(() => {
    assertJapaneseFinanceEngine();
    const doc = loadOrInitYearEndAdjustment(fiscalYear);
    assertYearEndEvidence(doc);
    if (doc.status === "closed") throw new Error("Closed annual payroll cannot be downgraded");
    const next = yeaSchema.parse({
      ...doc,
      status: "ready_for_handoff",
      updated_at: getClock().now().toISOString(),
    });
    writeYamlFileAtomic(yeaPath(fiscalYear), next);
    return next;
  });
}

export function buildPayrollYearEndReadiness(fiscalYear: string) {
  const yea = loadOrInitYearEndAdjustment(fiscalYear);
  let evidenceValid = false;
  try {
    assertYearEndEvidence(yea);
    evidenceValid = true;
  } catch {
    /* reported as not ready */
  }
  return {
    module: "jp_payroll" as const,
    fiscal_year: fiscalYear,
    bonus_runs_path: "data/finance/payroll-bonus-runs.yaml",
    yea_status: yea.status,
    yea_employees: yea.employees.length,
    note:
      yea.employees.length > 0
        ? `YEA draft ${yea.employees.length} 名 — e-file 提出はしない（ADR 0043）`
        : "Bonus/YEA — compute で給与台帳からドラフト作成。e-file 提出はしない。",
    ready_for_tax_handoff:
      evidenceValid && (yea.status === "ready_for_handoff" || yea.status === "closed"),
  };
}
