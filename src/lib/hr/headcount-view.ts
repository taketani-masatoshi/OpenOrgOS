/**
 * Executive L1 headcount view from data/hr/employees.yaml.
 * Counts and job_type breakdown only — never emits employee names.
 */
import { loadCompany, loadEmployees, loadPayroll } from "../data.js";
import { loadOrgChart } from "../org/org-chart.js";
import { currentDate } from "../utils.js";

export type HeadcountCoverage = "registered" | "unregistered" | "partial";

export interface HeadcountView {
  company_name: string;
  as_of: string;
  source_path: string;
  coverage: HeadcountCoverage;
  total: number;
  by_status: {
    active: number;
    leave: number;
    inactive: number;
  };
  /** Active + leave (in-roster headcount). */
  on_roster: number;
  by_employment_type: Record<string, number>;
  by_job_type: Record<string, number>;
  cross_check: {
    org_chart_linked: number;
    payroll_employee_ids: number;
  };
  notes: string[];
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Deterministic headcount from tenant YAML.
 * coverage=unregistered when employees.yaml is empty and no cross-source links exist.
 */
export function buildHeadcountView(opts?: { asOf?: string }): HeadcountView {
  const company = loadCompany();
  const asOf = opts?.asOf ?? currentDate();
  const sourcePath = "data/hr/employees.yaml";
  const notes: string[] = [];

  let file;
  try {
    file = loadEmployees();
  } catch (err) {
    return {
      company_name: company.name,
      as_of: asOf,
      source_path: sourcePath,
      coverage: "unregistered",
      total: 0,
      by_status: { active: 0, leave: 0, inactive: 0 },
      on_roster: 0,
      by_employment_type: {},
      by_job_type: {},
      cross_check: { org_chart_linked: 0, payroll_employee_ids: 0 },
      notes: [
        `未確認: ${sourcePath} を読めません（${err instanceof Error ? err.message : String(err)}）。`,
      ],
    };
  }

  const byStatus = { active: 0, leave: 0, inactive: 0 };
  const byEmploymentType: Record<string, number> = {};
  const byJobType: Record<string, number> = {};

  for (const emp of file.employees) {
    const status = emp.status ?? "inactive";
    if (status in byStatus) {
      byStatus[status as keyof typeof byStatus] += 1;
    } else {
      byStatus.inactive += 1;
    }
    bump(byEmploymentType, emp.employment_type ?? "unspecified");
    bump(byJobType, emp.job_type?.trim() || "unspecified");
  }

  const total = file.employees.length;
  const onRoster = byStatus.active + byStatus.leave;

  let orgChartLinked = 0;
  try {
    const chart = loadOrgChart();
    if (chart) {
      orgChartLinked = chart.nodes.filter((n) => Boolean(n.employee_id)).length;
    }
  } catch {
    /* optional */
  }

  let payrollIds = 0;
  try {
    const payroll = loadPayroll();
    payrollIds = payroll.employee_payroll?.employee_ids?.length ?? 0;
  } catch {
    /* optional */
  }

  if (orgChartLinked > 0 && orgChartLinked !== byStatus.active) {
    notes.push(
      `要整備: org-chart の employee_id リンク数（${orgChartLinked}）と active 従業員数（${byStatus.active}）が一致しません。`
    );
  }
  if (payrollIds > 0 && payrollIds !== byStatus.active) {
    notes.push(
      `要整備: payroll.employee_ids（${payrollIds}）と active 従業員数（${byStatus.active}）が一致しません。`
    );
  }
  if (file.notes?.trim()) {
    notes.push("employees.yaml notes あり（本文は L1 のため省略）");
  }

  let coverage: HeadcountCoverage;
  if (total === 0 && orgChartLinked === 0 && payrollIds === 0) {
    coverage = "unregistered";
    notes.unshift(
      "未登録: data/hr/employees.yaml に従業員がありません。Human Resources へ照会してください。"
    );
  } else if (total === 0 && (orgChartLinked > 0 || payrollIds > 0)) {
    coverage = "partial";
    notes.unshift(
      "部分整備: employees.yaml は空ですが、org-chart / payroll に人員リンクがあります。"
    );
  } else {
    coverage = "registered";
  }

  return {
    company_name: company.name,
    as_of: asOf,
    source_path: sourcePath,
    coverage,
    total,
    by_status: byStatus,
    on_roster: onRoster,
    by_employment_type: byEmploymentType,
    by_job_type: byJobType,
    cross_check: {
      org_chart_linked: orgChartLinked,
      payroll_employee_ids: payrollIds,
    },
    notes,
  };
}

/** L1 Markdown — counts only, no names. */
export function formatHeadcountMarkdown(view: HeadcountView): string {
  const lines = [
    `# 人員集計 — ${view.company_name}`,
    "",
    `**基準日:** ${view.as_of}`,
    `**ソース:** Path: \`${view.source_path}\``,
    `**被覆:** ${view.coverage}`,
    "",
    "## 在籍（L1）",
    `- **在籍（active + leave）:** **${view.on_roster}** 名`,
    `- active: ${view.by_status.active}`,
    `- leave: ${view.by_status.leave}`,
    `- inactive: ${view.by_status.inactive}`,
    `- 登録総数: ${view.total}`,
  ];

  const jobEntries = Object.entries(view.by_job_type).sort(([a], [b]) =>
    a.localeCompare(b, "ja")
  );
  if (jobEntries.length > 0 && view.total > 0) {
    lines.push("", "## 職種別");
    for (const [job, n] of jobEntries) {
      lines.push(`- ${job}: ${n}`);
    }
  }

  const empEntries = Object.entries(view.by_employment_type).sort(([a], [b]) =>
    a.localeCompare(b, "ja")
  );
  if (empEntries.length > 0 && view.total > 0) {
    lines.push("", "## 雇用形態別");
    for (const [t, n] of empEntries) {
      lines.push(`- ${t}: ${n}`);
    }
  }

  lines.push(
    "",
    "## 突き合わせ",
    `- org-chart employee_id リンク: ${view.cross_check.org_chart_linked}`,
    `- payroll employee_ids: ${view.cross_check.payroll_employee_ids}`,
    "",
    "この数値は `loadEmployees()` の決定論結果です。氏名は出力しません。"
  );

  if (view.notes.length > 0) {
    lines.push("", "## 注記", ...view.notes.map((n) => `- ${n}`));
  }

  return lines.join("\n");
}

/**
 * Short CEO-facing reply for Steward Chat (not the full CLI report).
 * Count questions → 「3名」only. Detail stays on `orgos hr headcount`.
 */
export function formatHeadcountCeoReply(view: HeadcountView): string {
  if (view.coverage === "unregistered") {
    return "未登録";
  }
  return `${view.on_roster}名`;
}

/** Compact lines for Today context injection. */
export function formatHeadcountTodayLines(view: HeadcountView): string[] {
  return [
    `- 在籍（active+leave）: ${view.on_roster} 名（active ${view.by_status.active} · leave ${view.by_status.leave}）`,
    `- 登録総数: ${view.total} · 被覆: ${view.coverage}`,
    `- Path: \`${view.source_path}\``,
  ];
}
