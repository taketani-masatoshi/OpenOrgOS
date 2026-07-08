import type { OrgActivityScope } from "../../../../schemas/org/scope.js";
import type { OrgApprovalRequest } from "../../../../schemas/org/approval.js";
import { orgApprovalRequestSchema } from "../../../../schemas/org/approval.js";
import type { NoticeWireType } from "../../../../schemas/protocol/pending-notice.js";
import {
  defaultApprovalPolicyRef,
  loadOrgApprovalRegistry,
  nextApprovalId,
  nextWireNoticeId,
  saveOrgApprovalRegistry,
} from "./registry.js";

export interface ProposeOrgApprovalOptions {
  scope: OrgActivityScope;
  subjectType: string;
  proposedBy: string;
  subjectRef?: string;
  message?: string;
  amount?: { value: number; currency: string };
  approvalPolicyRef?: string;
  wire?: {
    peerId: string;
    transactionType: NoticeWireType;
    contractId?: string;
    invoiceId?: string;
    brokerInstruction?: string;
    stakeholderId?: string;
    correlationEventId?: string;
    companyEventId?: string;
  };
  /** Wire notices keep NOTICE-* ids for backward compatibility. */
  useNoticeId?: boolean;
}

export function proposeOrgApproval(opts: ProposeOrgApprovalOptions): OrgApprovalRequest {
  if (opts.scope === "wire") {
    if (!opts.wire) {
      throw new Error("wire scope requires wire details");
    }
  }

  const approval = orgApprovalRequestSchema.parse({
    approval_id: opts.useNoticeId ? nextWireNoticeId() : nextApprovalId(),
    scope: opts.scope,
    status: "pending_approval",
    proposed_at: new Date().toISOString(),
    proposed_by: opts.proposedBy,
    subject_type: opts.subjectType,
    subject_ref: opts.subjectRef,
    amount: opts.amount,
    message: opts.message,
    approval_policy_ref: opts.approvalPolicyRef ?? defaultApprovalPolicyRef(),
    wire:
      opts.scope === "wire" && opts.wire
        ? {
            peer_id: opts.wire.peerId,
            transaction_type: opts.wire.transactionType,
            contract_id: opts.wire.contractId,
            invoice_id: opts.wire.invoiceId,
            broker_instruction: opts.wire.brokerInstruction,
            stakeholder_id: opts.wire.stakeholderId,
            correlation_event_id: opts.wire.correlationEventId,
            company_event_id: opts.wire.companyEventId,
          }
        : undefined,
  });

  const registry = loadOrgApprovalRegistry();
  registry.approvals.push(approval);
  saveOrgApprovalRegistry(registry);
  return approval;
}
