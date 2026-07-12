import {
  findOrgApproval,
  loadOrgApprovalRegistry,
  saveOrgApprovalRegistry,
} from "../org/approval/index.js";
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import {
  loadCorrespondenceDraft,
  markCorrespondenceDraftSent,
  saveCorrespondenceDraft,
} from "./draft.js";
import { sendCorrespondenceEmail } from "./mail-send.js";
import { sendSlackNotification } from "./slack-send.js";
import { assertCorrespondenceMailSetupReady } from "./mail-setup-readiness.js";
import { isDryRunSmtpHost, resolveMailConfig } from "./mail-config.js";
import { repairMissingApprovalForDraft } from "./approval-registry-repair.js";
import { assertHumanCorrespondenceApproval, isHumanApproverOperatorId } from "./human-approval.js";
import {
  createCompanyEvent,
  initCompanyEventsFile,
  ensureCompanyEventMonth,
  parseMonth,
} from "../company-events.js";
import { currentDate } from "../utils.js";

export class CorrespondenceApprovalGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorrespondenceApprovalGateError";
  }
}

export function assertCorrespondenceApproved(draft: CorrespondenceDraft): void {
  if (draft.status === "sent") {
    throw new CorrespondenceApprovalGateError(
      `Draft ${draft.draft_id} already sent at ${draft.sent_at}`
    );
  }
  if (draft.status === "rejected") {
    throw new CorrespondenceApprovalGateError(`Draft ${draft.draft_id} was rejected`);
  }
  if (draft.status === "draft" || draft.status === "pending_approval") {
    throw new CorrespondenceApprovalGateError(
      `Draft ${draft.draft_id} not approved — run org approval approve --id ${draft.approval_id ?? "?"}`
    );
  }
  if (draft.status !== "approved") {
    throw new CorrespondenceApprovalGateError(
      `Draft ${draft.draft_id} status ${draft.status} blocks send`
    );
  }
  if (!draft.approval_id) {
    throw new CorrespondenceApprovalGateError(
      `Draft ${draft.draft_id} has no approval_id — propose approval first`
    );
  }
  repairMissingApprovalForDraft(draft);
  const approval = findOrgApproval(draft.approval_id);
  if (!approval) {
    throw new CorrespondenceApprovalGateError(
      `Approval ${draft.approval_id} not found in pending-approvals.yaml`
    );
  }
  if (approval.status !== "approved" && approval.status !== "completed") {
    throw new CorrespondenceApprovalGateError(
      `Approval ${draft.approval_id} status is ${approval.status} — human approval required`
    );
  }
  assertHumanCorrespondenceApproval(approval, draft);
}

export function syncDraftApprovedFromRegistry(draftId: string): CorrespondenceDraft {
  const draft = loadCorrespondenceDraft(draftId);
  if (draft.status !== "pending_approval" || !draft.approval_id) return draft;
  const approval = findOrgApproval(draft.approval_id);
  if (approval?.status === "approved" || approval?.status === "completed") {
    return saveCorrespondenceDraft({ ...draft, status: "approved" });
  }
  return draft;
}

function completeCorrespondenceApproval(approvalId: string): void {
  const registry = loadOrgApprovalRegistry();
  const idx = registry.approvals.findIndex((a) => a.approval_id === approvalId);
  if (idx < 0) return;
  const approval = registry.approvals[idx]!;
  if (approval.status === "approved") {
    registry.approvals[idx] = { ...approval, status: "completed" };
    saveOrgApprovalRegistry(registry);
  }
}

export interface SendApprovedCorrespondenceResult {
  draft: CorrespondenceDraft;
  sendResult: { mode?: string; sent?: boolean; reason?: string; artifactPath?: string };
  companyEventId?: string;
}

export async function sendApprovedCorrespondence(opts: {
  draftId: string;
  operatorId: string;
  dryRun?: boolean;
}): Promise<SendApprovedCorrespondenceResult> {
  let draft = syncDraftApprovedFromRegistry(opts.draftId);
  assertCorrespondenceApproved(draft);

  if (!opts.dryRun && !isHumanApproverOperatorId(opts.operatorId)) {
    throw new CorrespondenceApprovalGateError(
      `correspondence send requires ceo/approver operator id — got "${opts.operatorId}". ` +
        "Agents create drafts only; humans send after approval."
    );
  }

  if (!opts.dryRun) {
    const smtpHost = resolveMailConfig().smtp?.host;
    if (!isDryRunSmtpHost(smtpHost)) {
      assertCorrespondenceMailSetupReady(draft.channel);
    }
  }

  let sendResult: SendApprovedCorrespondenceResult["sendResult"];
  if (draft.channel === "email") {
    const emailResult = await sendCorrespondenceEmail(draft, { dryRun: opts.dryRun });
    sendResult = emailResult;
    if (emailResult.mode === "dry_run" && !opts.dryRun) {
      // dry_run is acceptable when SMTP not configured
    }
  } else {
    const slackResult = await sendSlackNotification(draft, { dryRun: opts.dryRun });
    sendResult = slackResult;
    if (!slackResult.sent && !opts.dryRun) {
      throw new Error(`Slack send failed: ${slackResult.reason}`);
    }
  }

  if (opts.dryRun) {
    if (draft.notes?.includes("scheduling-case:")) {
      if (draft.approval_id) {
        completeCorrespondenceApproval(draft.approval_id);
      }
      draft = markCorrespondenceDraftSent(draft.draft_id, {
        sentBy: opts.operatorId,
      });
      const { handleSchedulingCorrespondenceSent } =
        await import("../scheduling-coordination/lifecycle.js");
      handleSchedulingCorrespondenceSent(draft);
    }
    return { draft, sendResult };
  }

  initCompanyEventsFile();
  const today = currentDate();
  ensureCompanyEventMonth(parseMonth(today.slice(0, 7)));
  const title =
    draft.channel === "email"
      ? `社外メール送信 — ${draft.subject ?? draft.draft_id}`
      : `Slack 通知 — ${draft.slack_channel ?? draft.draft_id}`;

  const event = createCompanyEvent({
    kind: "misc",
    title,
    occurredAt: today,
    slug: draft.draft_id
      .toLowerCase()
      .replace(/^draft-/, "correspondence-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, ""),
    related: { approval_id: draft.approval_id },
    notes: `Sent by ${opts.operatorId} via mail outbound correspondence (${draft.channel})`,
  });

  if (draft.approval_id) {
    completeCorrespondenceApproval(draft.approval_id);
  }

  draft = markCorrespondenceDraftSent(draft.draft_id, {
    sentBy: opts.operatorId,
    companyEventId: event.id,
  });
  if (draft.notes?.includes("scheduling-case:")) {
    const { handleSchedulingCorrespondenceSent } =
      await import("../scheduling-coordination/lifecycle.js");
    handleSchedulingCorrespondenceSent(draft);
  }

  return { draft, sendResult, companyEventId: event.id };
}
