/**
 * B-layer: tip must satisfy D1–D8 (real-operator track).
 * Only runs when ETAX_D18_ACCEPTANCE=1 so normal CI stays green on A-layer.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateD1,
  evaluateD2,
  evaluateD3,
  evaluateD4,
  evaluateD5,
  evaluateD6,
  evaluateD7,
  evaluateD8,
  evaluateAllDx,
} from "../src/lib/etax/acceptance.js";

const run = process.env.ETAX_D18_ACCEPTANCE === "1";

describe.skipIf(!run)("etax D1–D8 acceptance (B-layer · tip)", () => {
  it("D1-acc: Windows hostBound + reachable host", async () => {
    const r = await evaluateD1();
    expect(r.ok, r.blockers.join("; ")).toBe(true);
  });

  it("D2-acc: RHO0010 Layer1+Layer2", () => {
    const r = evaluateD2();
    expect(r.ok, r.blockers.join("; ")).toBe(true);
  });

  it("D3-acc: e-tax18 map + T-O2 real receipt", () => {
    const r = evaluateD3();
    expect(r.ok, r.blockers.join("; ")).toBe(true);
  });

  it("D4-acc: NTA transmission evidence on tip gate", () => {
    const r = evaluateD4();
    expect(r.ok, r.blockers.join("; ")).toBe(true);
  });

  it("D5-acc: production-gate certified", () => {
    const r = evaluateD5();
    expect(r.ok, r.blockers.join("; ")).toBe(true);
  });

  it("D6-acc: RHO0010 SUPPORTED + productionEligible", () => {
    const r = evaluateD6();
    expect(r.ok, r.blockers.join("; ")).toBe(true);
  });

  it("D7-acc: readiness + CERTIFIED banner + ToS", () => {
    const r = evaluateD7();
    expect(r.ok, r.blockers.join("; ")).toBe(true);
  });

  it("D8-acc: safety invariants", () => {
    const r = evaluateD8();
    expect(r.ok, r.blockers.join("; ")).toBe(true);
  });

  it("all Dx green together", async () => {
    const all = await evaluateAllDx();
    expect(all.ok, all.results.filter((x) => !x.ok).map((x) => `${x.id}:${x.blockers.join(",")}`).join(" | ")).toBe(
      true,
    );
    expect(all.certified).toBe(true);
  });
});

describe("etax D1–D8 acceptance harness (always on)", () => {
  it("evaluators return structured results without throwing", async () => {
    const all = await evaluateAllDx();
    expect(all.results).toHaveLength(8);
    expect(all.results.map((r) => r.id)).toEqual([
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "D7",
      "D8",
    ]);
    // Tip is not yet operator-complete — honesty check
    if (!all.certified) {
      expect(all.ok).toBe(false);
    }
  });

  it("D2 and D8 are tip-green without operator evidence", () => {
    const d2 = evaluateD2();
    const d8 = evaluateD8();
    expect(d2.ok, d2.blockers.join("; ")).toBe(true);
    expect(d8.ok, d8.blockers.join("; ")).toBe(true);
  });
});
