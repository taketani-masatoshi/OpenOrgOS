import { describe, expect, it } from "vitest";
import { runIsolatedSolePropLaneFAcceptance } from "../src/lib/product/ledger-sole-prop-lane-f-acceptance.js";

describe("sole prop lane F acceptance", () => {
  it(
    "scores 100 when owner capital, blue-return lines, and income tax all pass",
    () => {
      const result = runIsolatedSolePropLaneFAcceptance();
      expect(result.isolated).toBe(true);
      expect(result.max_score).toBe(100);
      const failed = result.checks.filter((row) => !row.pass);
      expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
      expect(result.score).toBe(100);
    },
    180_000,
  );
});
