import type { IsoRequirement } from "../../../../schemas/iso-requirements.js";
import { loadControlMaps } from "../../control-framework.js";
import {
  checkRecordsForStandard,
  loadRecordSpecs,
  recordRelPath,
  type IsoRecordReport,
} from "../../iso-records.js";
import { loadRequirements } from "../../iso-requirements.js";
import { findAuditPlan, setAuditFinding, type SetFindingOptions } from "./plan.js";

export interface PrecheckProposal {
  requirement_id: string;
  verdict: "conform" | "nonconform_minor";
  evidence: string[];
  sample: string;
  note: string;
  skipped: boolean;
  reason?: string;
}

const CORE_RECORD_FILES: Record<string, string[]> = {
  "CTL-CORE-internal-audit": ["internal-audit-plan.md"],
  "CTL-CORE-management-review": ["management-review.md"],
  "CTL-CORE-corrective-action": ["corrective-actions.csv"],
  "CTL-CORE-risk-approach": ["risk-opportunities.csv", "risk-register.csv"],
  "CTL-CORE-objectives-monitoring": ["quality-objectives.md", "kpi-log.csv", "enpi-log.csv"],
  "CTL-CORE-scope": ["applicability.md", "stakeholder-register.csv"],
};

function relFor(standard: string, file: string): string {
  const spec = loadRecordSpecs(standard)?.records.find((record) => record.file === file);
  return spec ? recordRelPath(standard, spec) : `docs/compliance/iso/${standard}/${file}`;
}

function reportsForRequirement(
  standard: string,
  controlIds: string[],
  reports: IsoRecordReport[]
): IsoRecordReport[] {
  const controls = loadControlMaps([standard]).filter((control) => controlIds.includes(control.id));
  const paths = new Set(controls.flatMap((control) => control.evidence_paths));
  const named = new Set(controlIds.flatMap((id) => CORE_RECORD_FILES[id] ?? []));
  return reports.filter((report) => {
    const relative = relFor(standard, report.file);
    return (
      named.has(report.file) ||
      paths.has(relative) ||
      [...paths].some((path) => path.endsWith(`/${report.file}`) || path.endsWith(report.file))
    );
  });
}

function errorsOf(report: IsoRecordReport): string[] {
  return report.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
}

function skippedProposal(requirementId: string, reason: string): PrecheckProposal {
  return {
    requirement_id: requirementId,
    verdict: "conform",
    evidence: [],
    sample: "",
    note: "",
    skipped: true,
    reason,
  };
}

function proposalForRequirement(
  standard: string,
  precheckRunId: string | undefined,
  requirement: IsoRequirement,
  reports: IsoRecordReport[]
): PrecheckProposal {
  const related = reportsForRequirement(standard, requirement.controls, reports);
  const errorReports = related.filter((report) => errorsOf(report).length > 0);
  if (errorReports.length > 0) {
    const first = errorReports[0]!;
    return {
      requirement_id: requirement.id,
      verdict: "nonconform_minor",
      evidence: related.map((report) => relFor(standard, report.file)),
      sample: `${first.file}: ${errorsOf(first)[0] ?? "記録仕様を満たしません"}`,
      note: "事前検査（決定論）による提案。監査員が確認すること。",
      skipped: false,
    };
  }

  const packErrors = reports.flatMap(errorsOf);
  const missing = related.filter((report) => !report.exists);
  const linkedClean = related.length > 0 && missing.length === 0;
  if (linkedClean || (related.length === 0 && packErrors.length === 0)) {
    const evidence =
      related.length > 0
        ? related.map((report) => relFor(standard, report.file))
        : precheckRunId
          ? [`precheck:${precheckRunId}`]
          : [`docs/compliance/iso/${standard}/`];
    return {
      requirement_id: requirement.id,
      verdict: "conform",
      evidence,
      sample: `関連記録 ${related.length} 件を事前検査し、仕様不備は検出されなかった`,
      note: "事前検査（決定論）による提案。監査員が確認すること。",
      skipped: false,
    };
  }

  const unfilled = related.filter(
    (report) =>
      report.exists &&
      errorsOf(report).some(
        (message) =>
          message.includes("プレースホルダ") ||
          message.includes("記録がありません") ||
          message.includes("1件も")
      )
  );
  const firstIncomplete = missing[0] ?? unfilled[0];
  if (firstIncomplete) {
    return {
      requirement_id: requirement.id,
      verdict: "nonconform_minor",
      evidence: [relFor(standard, firstIncomplete.file)],
      sample: `${firstIncomplete.file} が未作成または未記入（doc_missing）`,
      note: "事前検査（決定論）による提案。監査員が確認すること。",
      skipped: false,
    };
  }
  return skippedProposal(requirement.id, "語彙で表せない適合。人間が判定する");
}

export function proposePrecheckFindings(planId: string): PrecheckProposal[] {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  const requirements = loadRequirements(plan.standard)?.requirements ?? [];
  const reports = checkRecordsForStandard(plan.standard);
  const judged = new Set(plan.findings.map((finding) => finding.requirement_id));
  return requirements.map((requirement) =>
    judged.has(requirement.id)
      ? skippedProposal(requirement.id, "監査員が既に所見を記録している")
      : proposalForRequirement(plan.standard, plan.precheck_run_id, requirement, reports)
  );
}

export function applyPrecheckFindings(planId: string, recordedBy: string): PrecheckProposal[] {
  const proposals = proposePrecheckFindings(planId);
  for (const proposal of proposals) {
    if (proposal.skipped) continue;
    const options: SetFindingOptions = {
      planId,
      requirementId: proposal.requirement_id,
      verdict: proposal.verdict,
      evidence: proposal.evidence,
      sample: proposal.sample,
      note: proposal.note,
      recordedBy,
    };
    setAuditFinding(options);
  }
  return proposals;
}

export function buildAuditBrief(planId: string, requirementId: string): string {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  const requirement = loadRequirements(plan.standard)?.requirements.find(
    (item) => item.id === requirementId
  );
  if (!requirement) throw new Error(`${plan.standard} に要求事項 ${requirementId} がありません。`);
  const proposal = proposePrecheckFindings(planId).find(
    (item) => item.requirement_id === requirementId
  );
  const related = reportsForRequirement(
    plan.standard,
    requirement.controls,
    checkRecordsForStandard(plan.standard)
  );
  const lines = [
    `# 監査ブリーフィング ${requirementId}`,
    "",
    `**計画:** ${plan.plan_id} · ${plan.standard}`,
    `**言い換え（規格票の転記ではない）:** ${requirement.statement}`,
    `**統制:** ${requirement.controls.join(", ") || "—"}`,
    "",
    "## 何を見ればよいか",
    "",
  ];
  if (related.length === 0) {
    lines.push(
      "- パックの記録仕様に直接紐づく様式はない。関連する方針・台帳とサンプリング方針を見る。",
      ""
    );
  } else {
    for (const report of related) {
      const errors = errorsOf(report);
      lines.push(`- ${report.file}（${report.title}）${report.exists ? "" : " — 未作成"}`);
      for (const error of errors.slice(0, 5)) lines.push(`  - ${error}`);
    }
    lines.push("");
  }
  lines.push("## 自動提案の理由", "");
  if (!proposal) lines.push("提案なし。");
  else if (proposal.skipped) lines.push(proposal.reason ?? "人間判定の残件。");
  else {
    lines.push(
      `提案判定: ${proposal.verdict === "conform" ? "適合" : "軽微な不適合"}（決定論。監査員が承認する）`,
      `サンプリング案: ${proposal.sample}`
    );
  }
  lines.push(
    "",
    "ISO 本文は引用しない。判定は `orgos iso audit finding set` または署名で人間が行う。"
  );
  return lines.join("\n");
}

export interface FollowUpRow {
  requirement_id: string;
  verdict: string;
  open: boolean;
  effectiveness?: string;
}

export function assessFollowUp(planId: string): {
  rows: FollowUpRow[];
  open: number;
  closed_unverified: number;
} {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  const correctiveActions = checkRecordsForStandard(plan.standard).find((report) =>
    report.file.includes("corrective-actions")
  );
  const errors = correctiveActions ? errorsOf(correctiveActions) : [];
  const rows = plan.findings
    .filter((finding) => finding.verdict.startsWith("nonconform"))
    .map((finding) => ({
      requirement_id: finding.requirement_id,
      verdict: finding.verdict,
      open: true,
      effectiveness: errors[0] ?? "是正記録の仕様不備なし（有効性は監査員が確認）",
    }));
  return {
    rows,
    open: rows.length,
    closed_unverified: errors.filter(
      (message) => message.includes("有効性") || message.includes("根本原因")
    ).length,
  };
}

export function formatFollowUp(planId: string): string {
  const result = assessFollowUp(planId);
  const lines = [
    `# フォローアップ ${planId}`,
    "",
    `**未閉じの不適合:** ${result.open} 件`,
    `**是正の有効性確認が仕様上足りない行:** ${result.closed_unverified} 件`,
    "",
  ];
  for (const row of result.rows) {
    lines.push(`- ${row.requirement_id} · ${row.verdict} · ${row.effectiveness ?? ""}`);
  }
  if (result.rows.length === 0) lines.push("不適合の所見はありません。");
  return lines.join("\n");
}
