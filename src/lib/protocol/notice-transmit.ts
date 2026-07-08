import type { ApproveInterOrgNoticeResult } from "../wire/notice-workflow.js";
import type { DeliverEnvelopeResult } from "./transport.js";
import { deliverProtocolEnvelopeWithRelay } from "./transport.js";
import { maybeBindWitnessPoolFromContract } from "./contract-witness-pool.js";
import {
  evaluateWitnessWireGovernancePolicy,
  formatWitnessWireGovernancePolicySummary,
} from "./witness-policy.js";
import {
  formatWitnessFanOutSummary,
  maybeRegisterWitnessAfterWire,
} from "./witness-hook.js";
import type { WitnessPoolBindResult } from "./contract-witness-pool.js";

export interface NoticeTransmitResult {
  poolBind: WitnessPoolBindResult | null;
  delivery: DeliverEnvelopeResult;
  witness: Awaited<ReturnType<typeof maybeRegisterWitnessAfterWire>>;
  wireGovernanceWitness: ReturnType<typeof evaluateWitnessWireGovernancePolicy> | undefined;
  witnessSummary?: string;
  wireGovernanceSummary?: string;
}

export async function transmitApprovedNotice(
  result: ApproveInterOrgNoticeResult
): Promise<NoticeTransmitResult> {
  const poolBind = await maybeBindWitnessPoolFromContract(result.notice.contract_id);
  const delivery = await deliverProtocolEnvelopeWithRelay(
    result.transmission.envelope,
    result.notice.peer_id
  );
  const witness = await maybeRegisterWitnessAfterWire(result.transmission.envelope, "sent");
  const wireGovernanceWitness =
    witness && result.notice.approval_tier
      ? evaluateWitnessWireGovernancePolicy({
          tier: result.notice.approval_tier,
          quorum: witness.quorum,
        })
      : undefined;

  return {
    poolBind,
    delivery,
    witness,
    wireGovernanceWitness,
    witnessSummary: witness ? formatWitnessFanOutSummary(witness) : undefined,
    wireGovernanceSummary: wireGovernanceWitness
      ? formatWitnessWireGovernancePolicySummary(wireGovernanceWitness)
      : undefined,
  };
}

export function formatNoticeTransmitConsole(
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
