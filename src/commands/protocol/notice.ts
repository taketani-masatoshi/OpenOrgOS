/** Inter-org notice propose / approve command handlers. */
import { requireCliOperator } from "../../lib/console-auth/cli-operator.js";
import { applyProtocolTenant } from "./shared.js";
import {
  proposeInterOrgWire,
  approveInterOrgNotice,
  rejectInterOrgNotice,
  listPendingNotices,
  findPendingNotice,
  type ApproveInterOrgNoticeResult,
} from "../../lib/wire/index.js";
import { loadAuthorizedApprovers } from "../../lib/jurisdiction/wire-governance/index.js";
import {
  transmitApprovedNotice,
  type NoticeTransmitResult,
} from "../../lib/protocol/distribution/notice-transmit.js";

/** CLI presentation for an approved notice transmission (not used by lib transport). */
function formatNoticeTransmitConsole(
  result: ApproveInterOrgNoticeResult,
  transmit: NoticeTransmitResult,
  approver: string
): string[] {
  const lines = [
    `✓ transmitted ${result.transmission.transaction.transaction_id}`,
    `  notice: ${result.notice.notice_id} · approver: ${approver}`,
    `  tier: ${result.notice.approval_tier ?? "—"} · event_id: ${result.transmission.envelope.event_id}`,
  ];
  if (transmit.poolBind?.bound) {
    lines.push(
      `  witness pool: bound from ${transmit.poolBind.contract_id} · ${transmit.poolBind.hub_count} hub(s) · sla ${transmit.poolBind.sla}`
    );
  } else if (transmit.poolBind?.skipped_reason) {
    lines.push(`  witness pool: skipped (${transmit.poolBind.skipped_reason})`);
  } else if (transmit.poolBind?.error) {
    lines.push(`  witness pool: bind failed (${transmit.poolBind.error})`);
  }
  if (result.transmission.outboxPath) {
    lines.push(`  outbox: ${result.transmission.outboxPath}`);
  }
  if (transmit.delivery.delivered) {
    lines.push(`  delivered: ${transmit.delivery.reason} (HTTP ${transmit.delivery.httpStatus})`);
  } else if (transmit.delivery.queued) {
    lines.push(
      `  deliver: queued (${transmit.delivery.reason}) — run protocol deliver flush-pending`
    );
  } else {
    lines.push(`  deliver: skipped (${transmit.delivery.reason})`);
  }
  if (transmit.witnessSummary) {
    lines.push(`  ${transmit.witnessSummary}`);
  }
  if (transmit.wireGovernanceSummary) {
    lines.push(`  ${transmit.wireGovernanceSummary}`);
  }
  return lines;
}


export interface ProtocolNoticeProposeOptions {
  peer: string;
  operator: string;
  type?: string;
  contract?: string;
  correlationEvent?: string;
  companyEvent?: string;
  invoice?: string;
  brokerInstruction?: string;
  amount?: number;
  currency?: string;
  stakeholder?: string;
  message?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolNoticePropose(opts: ProtocolNoticeProposeOptions): void {
  applyProtocolTenant(opts.tenant);
  requireCliOperator({ permission: "protocol:draft", command: "protocol notice propose" });
  const txType = opts.type ?? "contract.execution.notice";
  try {
    const notice = proposeInterOrgWire({
      peerId: opts.peer,
      transactionType: txType as Parameters<typeof proposeInterOrgWire>[0]["transactionType"],
      proposedBy: opts.operator,
      contractId: opts.contract,
      correlationEventId: opts.correlationEvent,
      companyEventId: opts.companyEvent,
      invoiceId: opts.invoice,
      brokerInstruction: opts.brokerInstruction,
      stakeholderId: opts.stakeholder,
      amount:
        opts.amount != null
          ? { value: opts.amount, currency: opts.currency ?? "JPY" }
          : undefined,
      message: opts.message,
    });
    if (opts.json) {
      console.log(JSON.stringify(notice, null, 2));
      return;
    }
    console.log(`✓ ${notice.notice_id} pending approval`);
    console.log(`  type: ${notice.transaction_type} · peer: ${notice.peer_id}`);
    if (notice.contract_id) console.log(`  contract: ${notice.contract_id}`);
    if (notice.correlation_event_id) console.log(`  correlation: ${notice.correlation_event_id}`);
    if (opts.companyEvent) console.log(`  company_event: ${opts.companyEvent}`);
    console.log(`  operator: ${notice.proposed_by}`);
    console.log(`  Next: steward protocol notice approve --id ${notice.notice_id} --approver <CEO>`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolNoticeListOptions {
  status?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolNoticeList(opts: ProtocolNoticeListOptions): void {
  applyProtocolTenant(opts.tenant);
  const rows = listPendingNotices(
    opts.status ? { status: opts.status as "pending_approval" } : undefined
  );
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("No notices.");
    return;
  }
  console.log("| id | status | type | peer | proposed_by |");
  console.log("|----|--------|------|------|-------------|");
  for (const n of rows) {
    console.log(
      `| ${n.notice_id} | ${n.status} | ${n.transaction_type} | ${n.peer_id} | ${n.proposed_by} |`
    );
  }
}

export interface ProtocolNoticeApproveOptions {
  id: string;
  approver: string;
  coApprover?: string;
  operator?: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolNoticeApprove(opts: ProtocolNoticeApproveOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const auth = requireCliOperator({ permission: "protocol:approve", command: "protocol notice approve" });
  try {
    const result = approveInterOrgNotice({
      noticeId: opts.id,
      approverId: opts.approver || auth.record.approver_name || auth.record.display_name,
      coApproverId: opts.coApprover,
      operatorId: opts.operator || auth.record.operator_id,
    });
    const { withGovGatewayDeliver } = await import("../../lib/wire/gov-gateway/transport-bind.js");
    const transmit = await transmitApprovedNotice(result, withGovGatewayDeliver());

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ...result,
            pool_bind: transmit.poolBind,
            delivery: transmit.delivery,
            witness: transmit.witness,
            wire_governance_witness: transmit.wireGovernanceWitness,
          },
          null,
          2
        )
      );
      return;
    }
    for (const line of formatNoticeTransmitConsole(result, transmit, opts.approver)) {
      console.log(line);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolNoticeRejectOptions {
  id: string;
  approver: string;
  reason?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolNoticeReject(opts: ProtocolNoticeRejectOptions): void {
  applyProtocolTenant(opts.tenant);
  try {
    const notice = rejectInterOrgNotice({
      noticeId: opts.id,
      approverId: opts.approver,
      reason: opts.reason,
    });
    if (opts.json) {
      console.log(JSON.stringify(notice, null, 2));
      return;
    }
    console.log(`✓ rejected ${notice.notice_id}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolNoticeShowOptions {
  id: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolNoticeShow(opts: ProtocolNoticeShowOptions): void {
  applyProtocolTenant(opts.tenant);
  const notice = findPendingNotice(opts.id);
  if (!notice) {
    console.error(`Notice ${opts.id} not found`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(notice, null, 2));
    return;
  }
  console.log(`# ${notice.notice_id} · ${notice.status}`);
  console.log(`type: ${notice.transaction_type} · peer: ${notice.peer_id}`);
  if (notice.contract_id) console.log(`contract: ${notice.contract_id}`);
  if (notice.correlation_event_id) console.log(`correlation: ${notice.correlation_event_id}`);
  console.log(`proposed_by: ${notice.proposed_by} · ${notice.proposed_at.slice(0, 19)}`);
  if (notice.approver_id) console.log(`approver: ${notice.approver_id}`);
  if (notice.message) console.log(`message: ${notice.message}`);
  if (notice.transaction_id) console.log(`transaction_id: ${notice.transaction_id}`);
}

export interface ProtocolNoticeDraftOptions
  extends Omit<ProtocolNoticeProposeOptions, "operator"> {
  /** Secretary default operator label */
  operator?: string;
}

export function runProtocolNoticeDraft(opts: ProtocolNoticeDraftOptions): void {
  runProtocolNoticePropose({
    ...opts,
    operator: opts.operator ?? "秘書オペレータ",
  });
}

export interface ProtocolApproversListOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolApproversList(opts: ProtocolApproversListOptions): void {
  applyProtocolTenant(opts.tenant);
  const approvers = loadAuthorizedApprovers();
  if (opts.json) {
    console.log(JSON.stringify(approvers, null, 2));
    return;
  }
  if (approvers.length === 0) {
    console.log("No authorized approvers in company.yaml (directors / representative).");
    return;
  }
  console.log("Authorized approvers (inter-org wire):");
  for (const a of approvers) console.log(`  · ${a}`);
}

