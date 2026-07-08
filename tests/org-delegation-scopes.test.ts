import { describe, it, expect } from "vitest";
import { scopesForAgent, listAgentDelegationScopeIds } from "../src/lib/org/delegation-scopes.js";

describe("agent delegation scopes manifest", () => {
  it("loads contract agent scopes from platform manifest", () => {
    expect(scopesForAgent("contract")).toContain("contract.sign");
    expect(listAgentDelegationScopeIds()).toContain("finance");
  });

  it("falls back to agent.{id} for unknown agents", () => {
    expect(scopesForAgent("custom_agent")).toEqual(["agent.custom_agent"]);
  });
});
