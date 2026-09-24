import { describe, expect, it } from "vitest";
import { runIsolatedBookkeepingAcceptance } from "../src/lib/finance/acceptance/bookkeeping-acceptance.js";

describe("bookkeeping acceptance", () => {
  it(
    "scores 100 when every bookkeeping check passes",
    () => {
      const result = runIsolatedBookkeepingAcceptance();
      expect(result.isolated).toBe(true);
      expect(result.max_score).toBe(100);
      const failed = result.checks.filter((row) => !row.pass);
      expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
      expect(result.score).toBe(100);
      expect(result.checks.every((row) => row.pass)).toBe(true);
    },
    60_000,
  );
});
