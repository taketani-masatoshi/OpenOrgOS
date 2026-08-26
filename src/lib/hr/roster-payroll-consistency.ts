/**
 * Roster ↔ payroll / org-chart soft consistency.
 * Mismatches are warnings with fix_hints — never hard errors.
 * L1: messages and hints use employee_id only (no names).
 */
import { loadEmployees, loadPayroll } from "../data.js";
import { loadOrgChart } from "../org/org-chart.js";

export type RosterPayrollConsistencyCode =
  | "payroll_id_unknown"
  | "active_missing_from_payroll"
  | "payroll_count_mismatch"
  | "org_chart_id_unknown"
  | "org_chart_count_mismatch"
  | "si_flag_without_ids";

export type RosterPayrollConsistencyIssue = {
  code: RosterPayrollConsistencyCode;
  level: "warning";
  file: string;
  message: string;
  fix_hints: string[];
};

export type RosterPayrollConsistencyInput = {
  employees: Array<{ id: string; status?: string }>;
  payrollEmployeeIds: string[];
  hasWithholding: boolean;
  hasSocialInsurance: boolean;
  /** org-chart nodes that have a non-empty employee_id */
  orgChartEmployeeIds: string[];
};

const PAYROLL_FILE = "data/finance/payroll.yaml";
const ORG_CHART_FILE = "data/org/org-chart.yaml";
const EMPLOYEES_FILE = "data/hr/employees.yaml";

/**
 * Deterministic consistency checks from in-memory snapshots.
 * Prefer this in tests; production uses {@link collectRosterPayrollConsistencyIssues}.
 */
export function evaluateRosterPayrollConsistency(
  input: RosterPayrollConsistencyInput,
): RosterPayrollConsistencyIssue[] {
  const issues: RosterPayrollConsistencyIssue[] = [];
  const rosterIds = new Set(input.employees.map((e) => e.id));
  const activeIds = input.employees
    .filter((e) => (e.status ?? "inactive") === "active")
    .map((e) => e.id);
  const activeCount = activeIds.length;
  const payrollIds = input.payrollEmployeeIds;
  const payrollSet = new Set(payrollIds);
  const subjectToPayrollFlags =
    input.hasWithholding || input.hasSocialInsurance;

  let payrollIdLevel = false;

  for (const id of payrollIds) {
    if (!rosterIds.has(id)) {
      payrollIdLevel = true;
      issues.push({
        code: "payroll_id_unknown",
        level: "warning",
        file: PAYROLL_FILE,
        message: `可能性: payroll.employee_ids の ${id} が ${EMPLOYEES_FILE} に見つかりません（名簿欠落または誤 ID）。`,
        fix_hints: [
          `${EMPLOYEES_FILE} に ${id} を追加する（在籍が事実なら）`,
          `${PAYROLL_FILE} の employee_ids から誤った ${id} を削除する`,
        ],
      });
    }
  }

  if (input.hasSocialInsurance && payrollIds.length === 0) {
    payrollIdLevel = true;
    issues.push({
      code: "si_flag_without_ids",
      level: "warning",
      file: PAYROLL_FILE,
      message:
        "可能性: has_social_insurance が true ですが employee_ids が空です（社保対象者が未リンクの可能性）。",
      fix_hints: [
        `給与・社保対象の employee_id を ${PAYROLL_FILE} の employee_ids に列挙する`,
        "対象者がいない場合は has_social_insurance を false にし、tax_treatment / notes で方針を残す",
      ],
    });
  } else if (subjectToPayrollFlags && payrollIds.length > 0) {
    for (const id of activeIds) {
      if (payrollSet.has(id)) continue;
      payrollIdLevel = true;
      issues.push({
        code: "active_missing_from_payroll",
        level: "warning",
        file: PAYROLL_FILE,
        message: `可能性: active の ${id} が payroll.employee_ids にありません（給与・社保未リンクの可能性。未登録＝非従業員とは限りません）。`,
        fix_hints: [
          `給与・源泉・社保の対象なら ${PAYROLL_FILE} の employee_ids に ${id} を追加する`,
          "対象外なら payroll notes / tax_treatment に対象外理由を明記し、フラグ方針を見直す",
          `退職が確定している場合のみ ${EMPLOYEES_FILE} で ${id} の status を inactive にする（未納・未リンクだけでは inactive にしない）`,
        ],
      });
    }
  } else if (subjectToPayrollFlags && payrollIds.length === 0 && input.hasWithholding) {
    payrollIdLevel = true;
    issues.push({
      code: "active_missing_from_payroll",
      level: "warning",
      file: PAYROLL_FILE,
      message: `可能性: has_withholding が true ですが employee_ids が空です（active ${activeCount} 名が未リンクの可能性）。`,
      fix_hints: [
        `源泉対象の employee_id を ${PAYROLL_FILE} の employee_ids に列挙する`,
        "対象者がいない場合は has_withholding を false にし、notes で方針を残す",
      ],
    });
  }

  if (
    !payrollIdLevel &&
    payrollIds.length > 0 &&
    payrollIds.length !== activeCount
  ) {
    issues.push({
      code: "payroll_count_mismatch",
      level: "warning",
      file: PAYROLL_FILE,
      message: `可能性: payroll.employee_ids（${payrollIds.length}）と active 従業員数（${activeCount}）が一致しません。`,
      fix_hints: [
        `${PAYROLL_FILE} の employee_ids を給与・社保対象の active 名簿に合わせる`,
        `${EMPLOYEES_FILE} の status（active / leave / inactive）を実態に合わせる`,
      ],
    });
  }

  const orgIds = input.orgChartEmployeeIds.filter(Boolean);
  let orgIdLevel = false;

  for (const id of orgIds) {
    if (!rosterIds.has(id)) {
      orgIdLevel = true;
      issues.push({
        code: "org_chart_id_unknown",
        level: "warning",
        file: ORG_CHART_FILE,
        message: `可能性: org-chart の employee_id ${id} が ${EMPLOYEES_FILE} に見つかりません。`,
        fix_hints: [
          `${EMPLOYEES_FILE} に ${id} を追加する（在籍が事実なら）`,
          `${ORG_CHART_FILE} の該当ノードから誤った employee_id を外す`,
        ],
      });
    }
  }

  if (
    !orgIdLevel &&
    orgIds.length > 0 &&
    orgIds.length !== activeCount
  ) {
    issues.push({
      code: "org_chart_count_mismatch",
      level: "warning",
      file: ORG_CHART_FILE,
      message: `可能性: org-chart の employee_id リンク数（${orgIds.length}）と active 従業員数（${activeCount}）が一致しません。`,
      fix_hints: [
        `${ORG_CHART_FILE} の各組織単位に正しい employee_id をリンクする`,
        `${EMPLOYEES_FILE} の active 人数と突合し、欠落・余剰リンクを解消する`,
      ],
    });
  }

  return issues;
}

/**
 * Load tenant YAML and return soft consistency warnings.
 * Missing optional files are treated as empty (no hard fail).
 */
export function collectRosterPayrollConsistencyIssues(): RosterPayrollConsistencyIssue[] {
  let employees: RosterPayrollConsistencyInput["employees"] = [];
  try {
    const file = loadEmployees();
    employees = file.employees.map((e) => ({
      id: e.id,
      status: e.status,
    }));
  } catch {
    return [];
  }

  let payrollEmployeeIds: string[] = [];
  let hasWithholding = false;
  let hasSocialInsurance = false;
  try {
    const payroll = loadPayroll();
    const ep = payroll.employee_payroll;
    payrollEmployeeIds = ep?.employee_ids ?? [];
    hasWithholding = ep?.has_withholding ?? false;
    hasSocialInsurance = ep?.has_social_insurance ?? false;
  } catch {
    /* optional */
  }

  let orgChartEmployeeIds: string[] = [];
  try {
    const chart = loadOrgChart();
    if (chart) {
      orgChartEmployeeIds = chart.nodes
        .map((n) => n.employee_id)
        .filter((id): id is string => Boolean(id?.trim()));
    }
  } catch {
    /* optional */
  }

  return evaluateRosterPayrollConsistency({
    employees,
    payrollEmployeeIds,
    hasWithholding,
    hasSocialInsurance,
    orgChartEmployeeIds,
  });
}

/** One-line note for headcount / Today (message + first fix hint). */
export function formatConsistencyNote(
  issue: RosterPayrollConsistencyIssue,
): string {
  const hint = issue.fix_hints[0];
  return hint ? `${issue.message} 修正案: ${hint}` : issue.message;
}
