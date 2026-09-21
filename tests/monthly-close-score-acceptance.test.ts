import { describe, expect, it } from "vitest";
import { runIsolatedMonthlyCloseAcceptance } from "../src/lib/product/ledger-monthly-close-acceptance.js";

describe("monthly close score acceptance", () => {
  it(
    "scores 100 when every monthly close check passes",
    async () => {
      const result = await runIsolatedMonthlyCloseAcceptance();
      expect(result.isolated).toBe(true);
      expect(result.max_score).toBe(100);
      const failed = result.checks.filter((row) => !row.pass);
      expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
      expect(result.score).toBe(100);
    },
    180_000,
  );
});
