import { describe, it, expect } from "vitest";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";

describe("witness pool legacy reg004_policy alias", () => {
  it("normalizes reg004_policy to wire_governance_policy on load", () => {
    const parsed = witnessPoolConfigSchema.parse({
      enabled: true,
      reg004_policy: { require_quorum_for_tiers: ["B"], warn_only: true },
    });
    expect(parsed.wire_governance_policy).toEqual({
      require_quorum_for_tiers: ["B"],
      warn_only: true,
    });
  });
});
