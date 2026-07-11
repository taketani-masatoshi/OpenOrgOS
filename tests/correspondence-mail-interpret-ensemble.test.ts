import { describe, it, expect } from "vitest";
import {
  majorityVote,
  majorityVoteBoolean,
} from "../src/lib/correspondence/mail-interpret-ensemble.js";

describe("mail interpret ensemble vote", () => {
  it("picks majority intent", () => {
    const r = majorityVote(["return_item", "return_item", "inquiry"], "unknown");
    expect(r.winner).toBe("return_item");
    expect(r.agreement).toBeCloseTo(2 / 3);
  });

  it("majority boolean", () => {
    expect(majorityVoteBoolean([true, true, false]).winner).toBe(true);
    expect(majorityVoteBoolean([true, false]).agreement).toBe(0.5);
  });
});
