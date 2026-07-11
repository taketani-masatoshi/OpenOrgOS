import { describe, it, expect } from "vitest";
import {
  validateAuthorityExternalKeys,
  validateDelegationScopeAgents,
} from "../src/lib/agent-authority-verify.js";

describe("agent authority external keys", () => {
  it("delegation-scopes agents resolve in catalog", () => {
    expect(validateDelegationScopeAgents()).toEqual([]);
  });

  it("control framework primary/secondary agents resolve in catalog", () => {
    const issues = validateAuthorityExternalKeys();
    if (issues.length) console.log(issues.join("\n"));
    expect(issues).toEqual([]);
  });
});
