import { describe, expect, it } from "vitest";
import { PROVIDER_AUTH_MODES } from "../src/lib/finance/external-provider-adapters.js";

describe("external provider adapter contracts", () => {
  it("declares auth mode for every supported provider", () => {
    expect(Object.keys(PROVIDER_AUTH_MODES)).toHaveLength(6);
  });
});
