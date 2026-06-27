import type { WitnessQuorumResult } from "../../../schemas/protocol/witness-quorum.js";
import type { WireApprovalTier } from "../../../schemas/protocol/wire-approval.js";
import type { WitnessPoolConfig } from "../../../schemas/protocol/witness-pool.js";
import { resolveWitnessWireGovernancePolicy } from "../../../schemas/protocol/witness-pool.js";
import { loadWitnessPoolConfig } from "./witness-pool.js";

export interface WitnessWireGovernancePolicyInput {
  tier: WireApprovalTier;
  quorum: WitnessQuorumResult;
  pool?: WitnessPoolConfig;
}

export interface WitnessWireGovernancePolicyViolation {
  code: string;
  message: string;
  tier: WireApprovalTier;
}

export interface WitnessWireGovernancePolicyResult {
  tier: WireApprovalTier;
  warnOnly: boolean;
  required: boolean;
  satisfied: boolean;
  violations: WitnessWireGovernancePolicyViolation[];
}

export function evaluateWitnessWireGovernancePolicy(
  input: WitnessWireGovernancePolicyInput
): WitnessWireGovernancePolicyResult {
  const pool = input.pool ?? loadWitnessPoolConfig();
  const policy = resolveWitnessWireGovernancePolicy(pool);
  const requiredTiers = policy?.require_quorum_for_tiers ?? [];
  const warnOnly = policy?.warn_only ?? true;
  const required = requiredTiers.includes(input.tier);
  const satisfied = !required || input.quorum.satisfied;
  const violations: WitnessWireGovernancePolicyViolation[] = [];

  if (required && !input.quorum.satisfied) {
    violations.push({
      code: "witness-quorum-required",
      message: `Wire approval tier ${input.tier} requires witness quorum (${input.quorum.matched}/${input.quorum.required})`,
      tier: input.tier,
    });
  }

  return {
    tier: input.tier,
    warnOnly,
    required,
    satisfied,
    violations,
  };
}

export function formatWitnessWireGovernancePolicySummary(
  result: WitnessWireGovernancePolicyResult
): string | undefined {
  if (result.violations.length === 0) return undefined;
  const mode = result.warnOnly ? "warning" : "BLOCKED";
  return `wire-governance/witness ${mode}: ${result.violations.map((v) => v.message).join("; ")}`;
}

/** @deprecated Use evaluateWitnessWireGovernancePolicy */
export type WitnessReg004PolicyInput = WitnessWireGovernancePolicyInput;
/** @deprecated */
export type WitnessReg004PolicyResult = WitnessWireGovernancePolicyResult;
export const evaluateWitnessReg004Policy = evaluateWitnessWireGovernancePolicy;
export const formatWitnessReg004PolicySummary = formatWitnessWireGovernancePolicySummary;
