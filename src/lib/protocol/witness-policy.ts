import type { WitnessQuorumResult } from "../../../schemas/protocol/witness-quorum.js";
import type { Reg004TierWire, WitnessPoolConfig } from "../../../schemas/protocol/witness-pool.js";
import { loadWitnessPoolConfig } from "./witness-pool.js";

export interface WitnessReg004PolicyInput {
  tier: Reg004TierWire;
  quorum: WitnessQuorumResult;
  pool?: WitnessPoolConfig;
}

export interface WitnessReg004PolicyViolation {
  code: string;
  message: string;
  tier: Reg004TierWire;
}

export interface WitnessReg004PolicyResult {
  tier: Reg004TierWire;
  warnOnly: boolean;
  required: boolean;
  satisfied: boolean;
  violations: WitnessReg004PolicyViolation[];
}

export function evaluateWitnessReg004Policy(
  input: WitnessReg004PolicyInput
): WitnessReg004PolicyResult {
  const pool = input.pool ?? loadWitnessPoolConfig();
  const policy = pool.reg004_policy;
  const requiredTiers = policy?.require_quorum_for_tiers ?? [];
  const warnOnly = policy?.warn_only ?? true;
  const required = requiredTiers.includes(input.tier);
  const satisfied = !required || input.quorum.satisfied;
  const violations: WitnessReg004PolicyViolation[] = [];

  if (required && !input.quorum.satisfied) {
    violations.push({
      code: "witness-quorum-required",
      message: `REG-004 tier ${input.tier} requires witness quorum (${input.quorum.matched}/${input.quorum.required})`,
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

export function formatWitnessReg004PolicySummary(result: WitnessReg004PolicyResult): string | undefined {
  if (result.violations.length === 0) return undefined;
  const mode = result.warnOnly ? "warning" : "BLOCKED";
  return `reg004/witness ${mode}: ${result.violations.map((v) => v.message).join("; ")}`;
}
