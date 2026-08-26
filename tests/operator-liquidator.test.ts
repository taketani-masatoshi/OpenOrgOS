import { describe, expect, it } from "vitest";
import {
  assertLiquidatorExpiryWithinMax,
  maxLiquidatorExpiryMs,
  LIQUIDATOR_MAX_MONTHS,
} from "../src/commands/operator-liquidator.js";

describe("liquidator expiry", () => {
  it("allows expiry within 24 months of winding_down", () => {
    expect(() =>
      assertLiquidatorExpiryWithinMax("2027-06-01", "2026-01-01"),
    ).not.toThrow();
  });

  it("rejects expiry beyond 24 months", () => {
    expect(() =>
      assertLiquidatorExpiryWithinMax("2029-01-01", "2026-01-01"),
    ).toThrow(`${LIQUIDATOR_MAX_MONTHS}-month maximum`);
  });

  it("computes max expiry from declared_at", () => {
    const max = maxLiquidatorExpiryMs("2026-01-15");
    const d = new Date(max);
    expect(d.getUTCFullYear()).toBe(2028);
    expect(d.getUTCMonth()).toBe(0);
  });
});
