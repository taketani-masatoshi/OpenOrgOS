import type { ApproveInterOrgNoticeResult } from "../../wire/notice-workflow.js";
import type { DeliverEnvelopeResult } from "../transport/types.js";
import {
  deliverProtocolEnvelopeWithRelay,
  type DeliverProtocolEnvelopeOptions,
} from "../transport/transport.js";
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
  result: ApproveInterOrgNoticeResult,
  opts?: DeliverProtocolEnvelopeOptions
): Promise<NoticeTransmitResult> {
  const poolBind = await maybeBindWitnessPoolFromContract(result.notice.contract_id);
  const delivery = await deliverProtocolEnvelopeWithRelay(
    result.transmission.envelope,
    result.notice.peer_id,
    opts
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
