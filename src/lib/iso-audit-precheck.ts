/**
 * Deterministic finding proposals from A+B pre-check. Does not write major or
 * not_applicable — those remain the auditor's. LLM is not involved.
 */
import { loadControlMaps } from "./control-framework.js";
import {
  checkRecordsForStandard,
  loadRecordSpecs,
  recordRelPath,
  type IsoRecordReport,
} from "./iso-records.js";
import { loadRequirements } from "./iso-requirements.js";
import {
  findAuditPlan,
  setAuditFinding,
  type SetFindingOptions,
} from "./iso-audit-plan.js";

export interface PrecheckProposal {
  requirement_id: string;
  verdict: "conform" | "nonconform_minor";
  evidence: string[];
  sample: string;
  note: string;
  skipped: boolean;
  reason?: string;
}

function relFor(standard: string, file: string): string {
  const spec = loadRecordSpecs(standard)?.records.find((r) => r.file === file);
  if (spec) return recordRelPath(standard, spec);
  return `docs/compliance/iso/${standard}/${file}`;
}

const CORE_RECORD_FILES: Record<string, string[]> = {
  "CTL-CORE-internal-audit": ["internal-audit-plan.md"],
  "CTL-CORE-management-review": ["management-review.md"],
  "CTL-CORE-corrective-action": ["corrective-actions.csv"],
  "CTL-CORE-risk-approach": ["risk-opportunities.csv", "risk-register.csv"],
  "CTL-CORE-objectives-monitoring": ["quality-objectives.md", "kpi-log.csv", "enpi-log.csv"],
  "CTL-CORE-scope": ["applicability.md", "stakeholder-register.csv"],
};

function reportsForRequirement(
  standard: string,
  controlIds: string[],
  reports: IsoRecordReport[],
): IsoRecordReport[] {
  const controls = loadControlMaps([standard]).filter((c) => controlIds.includes(c.id));
  const paths = new Set(controls.flatMap((c) => c.evidence_paths));
  const named = new Set(controlIds.flatMap((id) => CORE_RECORD_FILES[id] ?? []));
  return reports.filter((r) => {
    const rel = relFor(standard, r.file);
    return (
      named.has(r.file) ||
      paths.has(rel) ||
      [...paths].some((p) => p.endsWith(`/${r.file}`) || p.endsWith(r.file))
    );
  });
}

function errorsOf(report: IsoRecordReport): string[] {
  return report.issues.filter((i) => i.severity === "error").map((i) => i.message);
}

export function proposePrecheckFindings(planId: string): PrecheckProposal[] {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  const requirements = loadRequirements(plan.standard)?.requirements ?? [];
  const reports = checkRecordsForStandard(plan.standard);
  const judged = new Set(plan.findings.map((f) => f.requirement_id));
  const out: PrecheckProposal[] = [];

  for (const req of requirements) {
    if (judged.has(req.id)) {
      out.push({
        requirement_id: req.id,
        verdict: "conform",
        evidence: [],
        sample: "",
        note: "",
        skipped: true,
        reason: "監査員が既に所見を記録している",
      });
      continue;
    }
    const related = reportsForRequirement(plan.standard, req.controls, reports);
    const errorReports = related.filter((r) => errorsOf(r).length > 0);
    const missing = related.filter((r) => !r.exists);
    const unfilled = related.filter(
      (r) => r.exists && errorsOf(r).some((m) => m.includes("プレースホルダ") || m.includes("記録がありません") || m.includes("1件も")),
    );

    if (errorReports.length > 0) {
      const first = errorReports[0]!;
      const msg = errorsOf(first)[0] ?? "記録仕様を満たしません";
      const rel = `${first.file}`;
      out.push({
        requirement_id: req.id,
        verdict: "nonconform_minor",
        evidence: related.map((r) => relFor(plan.standard, r.file)),
        sample: `${rel}: ${msg}`,
        note: "事前検査（決定論）による提案。監査員が確認すること。",
        skipped: false,
      });
      continue;
    }

    const packErrors = reports.flatMap((r) => errorsOf(r));
    const linkedClean = related.length > 0 && errorReports.length === 0 && missing.length === 0;
    const noLinkButPackClean = related.length === 0 && packErrors.length === 0;
    if (linkedClean || noLinkButPackClean) {
      const evidence =
        related.length > 0
          ? related.map((r) => relFor(plan.standard, r.file))
          : plan.precheck_run_id
            ? [`precheck:${plan.precheck_run_id}`]
            : [`docs/compliance/iso/${plan.standard}/`];
      out.push({
        requirement_id: req.id,
        verdict: "conform",
        evidence,
        sample: `関連記録 ${related.length} 件を事前検査し、仕様不備は検出されなかった`,
        note: "事前検査（決定論）による提案。監査員が確認すること。",
        skipped: false,
      });
      continue;
    }

    if (unfilled.length > 0 || missing.length > 0) {
      const first = (missing[0] ?? unfilled[0])!;
      out.push({
        requirement_id: req.id,
        verdict: "nonconform_minor",
        evidence: [relFor(plan.standard, first.file)],
        sample: `${first.file} が未作成または未記入（doc_missing）`,
        note: "事前検査（決定論）による提案。監査員が確認すること。",
        skipped: false,
      });
      continue;
    }

    out.push({
      requirement_id: req.id,
      verdict: "conform",
      evidence: [],
      sample: "",
      note: "",
      skipped: true,
      reason: "語彙で表せない適合。人間が判定する",
    });
  }
  return out;
}

export function applyPrecheckFindings(planId: string, recordedBy: string): PrecheckProposal[] {
  const proposals = proposePrecheckFindings(planId);
  for (const p of proposals) {
    if (p.skipped) continue;
    const options: SetFindingOptions = {
      planId,
      requirementId: p.requirement_id,
      verdict: p.verdict,
      evidence: p.evidence,
      sample: p.sample,
      note: p.note,
      recordedBy,
    };
    setAuditFinding(options);
  }
  return proposals;
}

export function buildAuditBrief(planId: string, requirementId: string): string {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  const req = loadRequirements(plan.standard)?.requirements.find((r) => r.id === requirementId);
  if (!req) throw new Error(`${plan.standard} に要求事項 ${requirementId} がありません。`);
  const proposal = proposePrecheckFindings(planId).find((p) => p.requirement_id === requirementId);
  const reports = checkRecordsForStandard(plan.standard);
  const related = reportsForRequirement(plan.standard, req.controls, reports);

  const lines = [
    `# 監査ブリーフィング ${requirementId}`,
    "",
    `**計画:** ${plan.plan_id} · ${plan.standard}`,
    `**言い換え（規格票の転記ではない）:** ${req.statement}`,
    `**統制:** ${req.controls.join(", ") || "—"}`,
    "",
    "## 何を見ればよいか",
    "",
  ];
  if (related.length === 0) {
    lines.push("- パックの記録仕様に直接紐づく様式はない。関連する方針・台帳とサンプリング方針を見る。", "");
  } else {
    for (const r of related) {
      const errs = r.issues.filter((i) => i.severity === "error").map((i) => i.message);
      lines.push(`- ${r.file}（${r.title}）${r.exists ? "" : " — 未作成"}`);
      for (const e of errs.slice(0, 5)) lines.push(`  - ${e}`);
    }
    lines.push("");
  }
  lines.push("## 自動提案の理由", "");
  if (!proposal) {
    lines.push("提案なし。");
  } else if (proposal.skipped) {
    lines.push(proposal.reason ?? "人間判定の残件。");
  } else {
    lines.push(`提案判定: ${proposal.verdict === "conform" ? "適合" : "軽微な不適合"}（決定論。監査員が承認する）`);
    lines.push(`サンプリング案: ${proposal.sample}`);
  }
  lines.push("", "ISO 本文は引用しない。判定は `orgos iso audit finding set` または署名で人間が行う。");
  return lines.join("\n");
}

export interface FollowUpRow {
  requirement_id: string;
  verdict: string;
  open: boolean;
  effectiveness?: string;
}

export function assessFollowUp(planId: string): { rows: FollowUpRow[]; open: number; closed_unverified: number } {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  const reports = checkRecordsForStandard(plan.standard);
  const ca = reports.find((r) => r.file.includes("corrective-actions"));
  const caErrors = ca ? ca.issues.filter((i) => i.severity === "error").map((i) => i.message) : [];
  const rows: FollowUpRow[] = plan.findings
    .filter((f) => f.verdict.startsWith("nonconform"))
    .map((f) => ({
      requirement_id: f.requirement_id,
      verdict: f.verdict,
      open: true,
      effectiveness: caErrors.length > 0 ? caErrors[0] : "是正記録の仕様不備なし（有効性は監査員が確認）",
    }));
  return {
    rows,
    open: rows.length,
    closed_unverified: caErrors.filter((m) => m.includes("有効性") || m.includes("根本原因")).length,
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
