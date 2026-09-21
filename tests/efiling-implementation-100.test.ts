import { describe, expect, it } from "vitest";
import { evaluateImplementationScore } from "../src/lib/efiling/implementation-score.js";
import { evaluateProductionEnablement } from "../src/lib/etax/production-review.js";

describe("efiling mechanism score M1–M13", () => {
  it("reports every item and refuses an env-forced pass", () => {
    const previous = process.env.ORGOS_EFILING_FORCE_OK;
    process.env.ORGOS_EFILING_FORCE_OK = "1";
    process.env.ORGOS_ETAX_PRODUCTION = "1";
    try {
      const score = evaluateImplementationScore();
      expect(score.items.map((row) => row.id)).toEqual([
        "M1",
        "M2",
        "M3",
        "M4",
        "M5",
        "M6",
        "M7",
        "M8",
        "M9",
        "M10",
        "M11",
        "M12",
        "M13",
      ]);
      expect(score.total).toBe(13);
      expect(score.lane2Certified).toBe(false);
      expect(score.productionSubmission).toBe("NOT CERTIFIED / DISABLED");
      expect(evaluateProductionEnablement().certified).toBe(false);
      for (const row of score.items) {
        if (!row.pass) expect(row.reason.trim().length).toBeGreaterThan(0);
      }
      const blocked = score.items.find((row) => !row.pass && row.reason.includes("SPEC_BLOCKED"));
      if (blocked) expect(score.ok).toBe(false);
      expect(score.ok).toBe(score.items.every((row) => row.pass));
    } finally {
      if (previous === undefined) delete process.env.ORGOS_EFILING_FORCE_OK;
      else process.env.ORGOS_EFILING_FORCE_OK = previous;
      delete process.env.ORGOS_ETAX_PRODUCTION;
    }
  });
});
