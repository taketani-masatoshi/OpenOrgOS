import type {
  OvertimeAgreement,
  OvertimeRecord,
  WorkRulesRecord,
  Workplace,
} from "../../../../../../schemas/jp-employment-rules.js";
import { evaluateAgreement, hasSuccessorAgreement } from "./agreement-rules.js";
import { jurisdictionCheck, overallStatus, type CheckStatus, type RuleCheck } from "./legal-limits.js";
import { evaluateEmployeeOvertime } from "./overtime-rules.js";
import { evaluateWorkplaceWorkRules } from "./work-rules-rules.js";

export interface SubjectResult {
  subject_id: string;
  label: string;
  status: CheckStatus;
  checks: RuleCheck[];
}

export interface CheckReport {
  module: "jp_employment_rules";
  kind: "work-rules" | "agreement" | "overtime";
  as_of: string;
  jurisdiction: string;
  status: CheckStatus;
  checks: RuleCheck[];
  results: SubjectResult[];
  disclaimer: string;
}

const DISCLAIMER = "準備・点検支援のみ。法令適合を保証しない。最終判断・届出は人間（社会保険労務士等の確認を推奨）。";

function toSubject(subjectId: string, label: string, checks: RuleCheck[]): SubjectResult {
  return { subject_id: subjectId, label, status: overallStatus(checks), checks };
}

function buildReport(
  kind: CheckReport["kind"],
  asOf: string,
  jurisdictionCode: string,
  results: SubjectResult[]
): CheckReport {
  const checks = [jurisdictionCheck(jurisdictionCode)];
  const status = overallStatus([...checks, ...results.flatMap((r) => r.checks)]);
  return { module: "jp_employment_rules", kind, as_of: asOf, jurisdiction: jurisdictionCode, status, checks, results, disclaimer: DISCLAIMER };
}

export function buildWorkRulesReport(input: {
  asOf: string;
  jurisdictionCode: string;
  workplaces: readonly Workplace[];
  workRules: readonly WorkRulesRecord[];
}): CheckReport {
  const results = input.workplaces.map((wp) => {
    const rules = input.workRules.find((r) => r.workplace_id === wp.id);
    return toSubject(wp.id, wp.name, evaluateWorkplaceWorkRules(wp, rules));
  });
  return buildReport("work-rules", input.asOf, input.jurisdictionCode, results);
}

export function buildAgreementReport(input: {
  asOf: string;
  jurisdictionCode: string;
  agreements: readonly OvertimeAgreement[];
}): CheckReport {
  const results = input.agreements.map((agreement) => {
    const successor = hasSuccessorAgreement(agreement, input.agreements);
    return toSubject(agreement.id, agreement.workplace_id, evaluateAgreement(agreement, input.asOf, successor));
  });
  return buildReport("agreement", input.asOf, input.jurisdictionCode, results);
}

function missingAgreementCheck(agreementId: string): RuleCheck[] {
  return [{ id: "agreement-ref", label: "適用される36協定", status: "needs_review", detail: `協定 ${agreementId} が未登録` }];
}

export function buildOvertimeReport(input: {
  targetMonth: string;
  jurisdictionCode: string;
  agreements: readonly OvertimeAgreement[];
  records: readonly OvertimeRecord[];
}): CheckReport {
  const results = input.records.map((record) => {
    const agreement = input.agreements.find((a) => a.id === record.agreement_id);
    const checks = agreement
      ? evaluateEmployeeOvertime(record, agreement, input.targetMonth)
      : missingAgreementCheck(record.agreement_id);
    return toSubject(record.employee_id, record.agreement_id, checks);
  });
  return buildReport("overtime", input.targetMonth, input.jurisdictionCode, results);
}

const STATUS_MARK: Record<CheckStatus, string> = {
  ok: "✓",
  alert: "!",
  needs_review: "?",
  violation: "✗",
};

export function formatReport(report: CheckReport, title: string): string {
  const lines = [`# ${title}（${report.as_of} · 法域 ${report.jurisdiction}）`, ""];
  for (const c of report.checks) lines.push(`${STATUS_MARK[c.status]} ${c.label} — ${c.detail}`);
  for (const r of report.results) {
    lines.push("", `## ${r.subject_id} · ${r.label} — ${r.status}`);
    for (const c of r.checks) {
      lines.push(`${STATUS_MARK[c.status]} ${c.label} — ${c.detail}${c.basis ? `（${c.basis}）` : ""}`);
    }
  }
  lines.push("", `総合: ${report.status} · ${report.disclaimer}`);
  return lines.join("\n");
}
