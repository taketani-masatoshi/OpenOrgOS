import { describe, expect, it } from "vitest";
import {
  listTenantsMissingOperatorRegistry,
  runTenantOperatorRegistryChecks,
} from "../src/lib/security-validate.js";

describe("tenant operator registry coverage", () => {
  it("every tenant with data/org has operators.yaml", () => {
    expect(listTenantsMissingOperatorRegistry()).toEqual([]);
  });

  it("runTenantOperatorRegistryChecks returns no errors", () => {
    const errors = runTenantOperatorRegistryChecks();
    expect(errors).toEqual([]);
  });
});
