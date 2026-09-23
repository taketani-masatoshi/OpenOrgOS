import type { IsoAuditPlan, IsoAuditVerdict } from "../../../../schemas/iso-audit-plan.js";
import { loadRequirements } from "../../iso-requirements.js";
import { auditPlanProgress, auditSignoffValid } from "./plan.js";

const VERDICT_LABELS: Record<IsoAuditVerdict, string> = {
  conform: "適合",
  nonconform_minor: "軽微な不適合",
  nonconform_major: "重大な不適合",
  observation: "観察事項",
  not_applicable: "適用外",
};

export function formatAuditPlan(plan: IsoAuditPlan): string {
  const progress = auditPlanProgress(plan);
  const requirements = loadRequirements(plan.standard)?.requirements ?? [];
  const lines = [
    `# 内部監査計画 ${plan.plan_id} — ${plan.standard}`,
    "",
    `**監査員:** ${plan.auditor_name ?? plan.auditor_operator_id}（${plan.auditor_operator_id}）`,
    `**対象期間:** ${plan.period_start} 〜 ${plan.period_end}`,
    `**状態:** ${plan.status}`,
    `**判定:** ${progress.judged} / ${progress.total} 件`,
    "",
  ];
  if (plan.sampling) lines.push(`**サンプリング方針:** ${plan.sampling}`, "");
  if (plan.criteria.length > 0) lines.push(`**監査基準:** ${plan.criteria.join(" · ")}`, "");
  if (plan.precheck_run_id) {
    lines.push(`**事前検査:** ${plan.precheck_run_id}（orgos iso audit run の結果）`, "");
  }

  lines.push("## 所見", "", "| 要求事項 | 箇条 | 判定 | 根拠 | 記述 |", "|---|---|---|---|---|");
  for (const requirement of requirements) {
    const finding = plan.findings.find((item) => item.requirement_id === requirement.id);
    lines.push(
      `| ${requirement.id} | ${requirement.clause} | ${finding ? VERDICT_LABELS[finding.verdict] : "未判定"} | ` +
        `${finding?.evidence.join("<br>") ?? "—"} | ${finding?.note ?? "—"} |`
    );
  }

  if (plan.conclusion) {
    lines.push(
      "",
      "## 結論",
      "",
      plan.conclusion.summary,
      "",
      `**不適合:** ${plan.conclusion.nonconformities} 件（うち重大 ${plan.conclusion.major} 件）`,
      `**結論日時:** ${plan.conclusion.concluded_at} · ${plan.conclusion.concluded_by}`
    );
  }
  if (plan.signoff) {
    lines.push(
      "",
      "## 署名",
      "",
      `**承認:** ${plan.signoff.approval_id} · ${plan.signoff.signed_by_operator_id} · ${plan.signoff.signed_at}`,
      auditSignoffValid(plan)
        ? "**検証:** 署名後に所見は変更されていません。"
        : "**検証:** ✗ 署名後に所見が変更されています。再監査・再署名が必要です。"
    );
  }
  if (requirements.length > 0 && requirements.every((requirement) => !requirement.verified_on)) {
    lines.push(
      "",
      "要求事項の文言は規格票の転記ではなく言い換えである（`orgos iso requirements --unverified`）。"
    );
  }
  return lines.join("\n");
}
