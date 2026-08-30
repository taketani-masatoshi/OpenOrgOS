import { setTenantId } from "../lib/tenant.js";
import { proposeOrgApproval, humanApproveOrgApproval } from "../lib/org/approval/index.js";
import { requireCliHumanApproval } from "../lib/console-auth/cli-operator.js";
import {
  auditPlanDigest,
  findAuditPlan,
  formatAuditPlan,
  recordAuditSignoff,
} from "../lib/iso-audit-plan.js";

/** Approval subject for a concluded internal audit. */
export const AUDIT_SIGNOFF_SUBJECT_TYPE = "iso.internal_audit.signoff";

export interface IsoAuditSignCliOptions {
  tenant?: string;
  plan?: string;
  approver?: string;
  json?: boolean;
}

/**
 * Sign a concluded audit through the existing approval path.
 *
 * No new signing scheme is introduced: the plan is proposed as an org approval
 * and passed through `humanApproveOrgApproval`, which already binds an
 * authenticated human operator, refuses self-approval, and records an
 * attestation. The plan digest is stored alongside, so findings edited after
 * signing stop verifying.
 */
export function runIsoAuditSign(options: IsoAuditSignCliOptions = {}): void {
  if (options.tenant) setTenantId(options.tenant);
  if (!options.plan) {
    console.error("--plan <IAP-...> が必要です。");
    process.exit(1);
  }

  const plan = findAuditPlan(options.plan);
  if (!plan) {
    console.error(`監査計画 ${options.plan} がありません。`);
    process.exit(1);
  }
  if (plan.status !== "concluded") {
    console.error(
      `${plan.plan_id} は ${plan.status} です。orgos iso audit conclude を先に実行してください。`,
    );
    process.exit(1);
  }

  let auth;
  try {
    auth = requireCliHumanApproval("orgos iso audit sign");
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
  if (auth.record.operator_id === plan.auditor_operator_id) {
    console.error("監査員が自らの監査結論に署名することはできません。");
    process.exit(1);
  }

  try {
    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType: AUDIT_SIGNOFF_SUBJECT_TYPE,
      subjectRef: plan.plan_id,
      proposedBy: plan.auditor_operator_id,
      message:
        `${plan.standard} 内部監査 ${plan.plan_id}（${plan.period_start}〜${plan.period_end}）の結論。` +
        `不適合 ${plan.conclusion?.nonconformities ?? 0} 件 · digest ${auditPlanDigest(plan).slice(0, 12)}`,
    });
    humanApproveOrgApproval({
      approvalId: approval.approval_id,
      approverId: options.approver?.trim() || auth.record.approver_name || auth.record.display_name,
      operatorId: auth.record.operator_id,
      source: "cli",
    });
    const signed = recordAuditSignoff(plan.plan_id, {
      approvalId: approval.approval_id,
      operatorId: auth.record.operator_id,
    });
    if (options.json) {
      console.log(JSON.stringify(signed, null, 2));
    } else {
      console.log(formatAuditPlan(signed));
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
