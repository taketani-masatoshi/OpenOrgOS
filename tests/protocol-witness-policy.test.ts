import { describe, it, expect } from "vitest";
import { evaluateWitnessWireGovernancePolicy } from "../src/lib/protocol/witness-policy.js";
import type { WitnessQuorumResult } from "../schemas/protocol/witness-quorum.js";

const satisfied: WitnessQuorumResult = {
  satisfied: true,
  required: 1,
  matched: 1,
  mode: "any_of_n",
};

const unsatisfied: WitnessQuorumResult = {
  satisfied: false,
  required: 1,
  matched: 0,
  mode: "any_of_n",
};

describe("witness wire-governance policy", () => {
  it("warns when tier B requires quorum but none satisfied", () => {
    const result = evaluateWitnessWireGovernancePolicy({
      tier: "B",
      quorum: unsatisfied,
      pool: {
        enabled: true,
        quorum: { mode: "any_of_n" },
        hubs: [],
        register_on: "both",
        wire_governance_policy: { require_quorum_for_tiers: ["B", "C"], warn_only: true },
      },
    });
    expect(result.required).toBe(true);
    expect(result.satisfied).toBe(false);
    expect(result.warnOnly).toBe(true);
    expect(result.violations).toHaveLength(1);
  });

  it("passes tier A when quorum not required", () => {
    const result = evaluateWitnessWireGovernancePolicy({
      tier: "A",
      quorum: unsatisfied,
      pool: {
        enabled: true,
        quorum: { mode: "any_of_n" },
        hubs: [],
        register_on: "both",
        wire_governance_policy: { require_quorum_for_tiers: ["B"], warn_only: true },
      },
    });
    expect(result.required).toBe(false);
    expect(result.satisfied).toBe(true);
  });

  it("passes tier B when quorum satisfied", () => {
    const result = evaluateWitnessWireGovernancePolicy({
      tier: "B",
      quorum: satisfied,
      pool: {
        enabled: true,
        quorum: { mode: "any_of_n" },
        hubs: [],
        register_on: "both",
        wire_governance_policy: { require_quorum_for_tiers: ["B"], warn_only: false },
      },
    });
    expect(result.satisfied).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
