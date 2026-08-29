/**
 * Bonus + year-end adjustment (YEA) skeleton for jp_payroll Phase 4+.
 * Full automation remains deferred (ADR 0043) — deterministic stubs for product surface.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";
import { getClock } from "../runtime-context.js";
import { loadPayroll } from "../data.js";
import { computePayrollMonth } from "./payroll-jp.js";
import { appendJournalEntry } from "./expense-claim-journal.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";

const bonusRunSchema = z.object({
  version: z.literal(1),
  runs: z.array(
    z.object({
      run_id: z.string(),
      period: z.string(),
      employee_id: z.string().optional(),
      gross_yen: z.number().nonnegative(),
      withholding_yen: z.number().nonnegative(),
      social_yen: z.number().nonnegative(),
      net_yen: z.number().nonnegative(),
      status: z.enum(["draft", "posted", "paid"]),
      created_at: z.string(),
    }),
  ),
});

const yeaSchema = z.object({
  version: z.literal(1),
  fiscal_year: z.string(),
  status: z.enum(["not_started", "in_progress", "ready_for_handoff", "closed"]),
  employees: z.array(
    z.object({
      employee_id: z.string(),
      annual_gross_yen: z.number().nonnegative().optional(),
      withholding_total_yen: z.number().nonnegative().optional(),
      yea_settlement_yen: z.number().optional(),
      note: z.string().optional(),
    }),
  ),
  updated_at: z.string(),
});

function bonusPath(): string {
  return join(getDataDir(), "finance", "payroll-bonus-runs.yaml");
}

function yeaPath(fiscalYear: string): string {
  return join(getDataDir(), "finance", "year-end-adjustment", `${fiscalYear}.yaml`);
}

export function computeBonusDraft(input: {
  period: string;
  grossYen: number;
  employeeId?: string;
}): z.infer<typeof bonusRunSchema>["runs"][number] {
  const withholding = Math.round(input.grossYen * 0.1021);
  const social = Math.round(input.grossYen * 0.15);
  return {
    run_id: `BONUS-${input.period}-${Date.now()}`,
    period: input.period,
    employee_id: input.employeeId,
    gross_yen: input.grossYen,
    withholding_yen: withholding,
    social_yen: social,
    net_yen: input.grossYen - withholding,
    status: "draft",
    created_at: getClock().now().toISOString(),
  };
}

export function saveBonusDraft(run: ReturnType<typeof computeBonusDraft>): void {
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  const path = bonusPath();
  const file = existsSync(path)
    ? bonusRunSchema.parse(YAML.parse(readFileSync(path, "utf-8")))
    : { version: 1 as const, runs: [] };
  file.runs.push(run);
  writeFileSync(path, YAML.stringify(file), "utf-8");
}

/** Post a bonus draft run as a GL journal (skeleton — Phase 4+ full payroll). */
export function postBonusDraftJournal(input: {
  runId: string;
  authorizedBy: string;
}): { entry_id: string; run_id: string } {
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

  const accounts = resolveJournalSourceAccounts();
  const entryId = `JE-BONUS-${run.period}-${run.run_id.slice(-8)}`;
  const socialEmployee = run.social_yen;
  appendJournalEntry(
    {
      entry_id: entryId,
      occurred_at: `${run.period}-20T12:00:00.000Z`,
      description: `Bonus draft post ${run.run_id}`,
      source: { kind: "payroll", period: run.period },
      evidence_refs: [`bonus:${run.run_id}`],
      lines: [
        {
          account_code: accounts.payroll_expense,
          debit_yen: run.gross_yen + socialEmployee,
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
          credit_yen: socialEmployee,
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
    { postedBy: input.authorizedBy },
  );

  run.status = "posted";
  writeFileSync(path, YAML.stringify(file), "utf-8");
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
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, YAML.stringify(doc), "utf-8");
  return doc;
}

/** Deterministic YEA draft from payroll.yaml — not e-file. */
export function computeYearEndAdjustment(fiscalYear: string) {
  const payroll = loadPayroll();
  const monthKey = `${fiscalYear.replace(/^FY/i, "")}-12`;
  const employees: z.infer<typeof yeaSchema>["employees"] = [];

  for (const officer of payroll.officers ?? []) {
    const monthly =
      officer.monthly ??
      (typeof officer.annual === "number" ? Math.round(officer.annual / 12) : 0);
    const annual = officer.annual ?? monthly * 12;
    let withholding: number | undefined;
    if (monthly > 0) {
      try {
        withholding = computePayrollMonth({ month: monthKey, grossYen: monthly }).withholding_yen * 12;
      } catch {
        withholding = undefined;
      }
    }
    employees.push({
      employee_id: officer.employee_id ?? `OFF-${officer.name}`,
      annual_gross_yen: annual,
      withholding_total_yen: withholding,
      yea_settlement_yen: 0,
      note: officer.role ?? officer.name,
    });
  }

  const monthlyGross = payroll.employee_payroll?.monthly_gross_jpy ?? 0;
  if (monthlyGross > 0) {
    let withholding: number | undefined;
    try {
      withholding = computePayrollMonth({ month: monthKey, grossYen: monthlyGross }).withholding_yen * 12;
    } catch {
      withholding = undefined;
    }
    const ids = payroll.employee_payroll?.employee_ids ?? [];
    employees.push({
      employee_id: ids[0] ?? "EMP-PAYROLL",
      annual_gross_yen: monthlyGross * 12,
      withholding_total_yen: withholding,
      yea_settlement_yen: 0,
      note: "employee_payroll monthly × 12",
    });
  }

  const next = yeaSchema.parse({
    version: 1,
    fiscal_year: fiscalYear,
    status: "in_progress",
    employees,
    updated_at: getClock().now().toISOString(),
  });
  mkdirSync(join(yeaPath(fiscalYear), ".."), { recursive: true });
  writeFileSync(yeaPath(fiscalYear), YAML.stringify(next), "utf-8");
  return next;
}

/** Chat / Console 向け集計。個人別明細は YAML（gitignore）のみ。 */
export function summarizeYearEndAdjustment(yea: z.infer<typeof yeaSchema>) {
  return {
    fiscal_year: yea.fiscal_year,
    status: yea.status,
    employee_count: yea.employees.length,
    totals: {
      annual_gross_yen: yea.employees.reduce((sum, row) => sum + (row.annual_gross_yen ?? 0), 0),
      withholding_total_yen: yea.employees.reduce(
        (sum, row) => sum + (row.withholding_total_yen ?? 0),
        0,
      ),
    },
    note: "個人別明細は year-end-adjustment YAML（gitignore）。e-file 提出はしない。",
  };
}

export function markYearEndReadyForHandoff(fiscalYear: string) {
  const doc = loadOrInitYearEndAdjustment(fiscalYear);
  const next = yeaSchema.parse({
    ...doc,
    status: "ready_for_handoff",
    updated_at: getClock().now().toISOString(),
  });
  writeFileSync(yeaPath(fiscalYear), YAML.stringify(next), "utf-8");
  return next;
}

export function buildPayrollYearEndReadiness(fiscalYear: string) {
  const yea = loadOrInitYearEndAdjustment(fiscalYear);
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
    ready_for_tax_handoff: yea.status === "ready_for_handoff" || yea.status === "closed",
  };
}
