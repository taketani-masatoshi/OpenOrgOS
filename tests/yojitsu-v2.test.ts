import { beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { computeVarianceReport, formatVarianceMarkdown } from "../src/lib/variance.js";
import {
  isLegacyYojitsuSide,
  normalizeYojitsuSide,
} from "../src/lib/yojitsu-normalize.js";
import { loadYojitsuFyPlan } from "../src/lib/data.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("yojitsu v2", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("normalizes MAL legacy columns to lines[]", () => {
    const plan = loadYojitsuFyPlan("FY2026");
    expect(plan).toBeDefined();
    const feb = plan!.months.find((m) => m.month === "2026-02");
    expect(feb?.plan.lines.some((l) => l.segment.includes("番町"))).toBe(true);
    expect(isLegacyYojitsuSide(feb?.plan)).toBe(false);
    expect(sumRevenueCheck(feb!.plan)).toBeGreaterThan(0);
  });

  it("demo variance markdown shows segment names", () => {
    const root = join(import.meta.dirname, "..");
    const out = execFileSync(
      "npm",
      ["run", "orgos", "--", "--tenant", "demo", "finances", "variance"],
      { cwd: root, encoding: "utf-8", env: { ...process.env, ORGOS_TENANT: "demo" } }
    );
    expect(out).toContain("港湾マンション501（賃貸）");
    expect(out).toContain("セグメント別");
  });

  it("demo steward finances variance CLI shows segment names", () => {
    const root = join(import.meta.dirname, "..");
    const out = execFileSync(
      "npm",
      ["run", "orgos", "--", "--tenant", "demo", "finances", "variance"],
      { cwd: root, encoding: "utf-8", env: { ...process.env, ORGOS_TENANT: "demo" } }
    );
    expect(out).toContain("港湾マンション501（賃貸）");
  });

  it("converts legacy side fields via adapter", () => {
    const side = normalizeYojitsuSide({
      revenue_bancho: 100000,
      revenue_kamezawa: 50000,
      depreciation: 29433,
    });
    expect(side.lines).toHaveLength(3);
    expect(side.lines.find((l) => l.kind === "revenue" && l.amount === 100000)?.segment).toContain(
      "番町"
    );
  });
});

function sumRevenueCheck(side: { lines: { kind: string; amount: number }[] }): number {
  return side.lines.filter((l) => l.kind === "revenue").reduce((s, l) => s + l.amount, 0);
}
