import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canvasViewModelSchema } from "../schemas/canvas-view.js";
import { buildObligationsPortfolio } from "../src/lib/compliance/obligations-portfolio.js";
import { assertComplianceGvpViewModelNoL2 } from "../src/lib/canvas-views/builders/compliance-gvp.js";
import { assertComplianceQmsViewModelNoL2 } from "../src/lib/canvas-views/builders/compliance-qms.js";
import { syncCanvasView } from "../src/lib/canvas-views/sync-view.js";
import {
  collectGvpSignals,
  collectQmsSignals,
} from "../src/lib/medical-device/compliance-signals.js";
import { buildGvpPortfolio } from "../src/lib/medical-device/gvp-portfolio.js";
import { buildQmsPortfolio } from "../src/lib/medical-device/qms-portfolio.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("medical-device QMS/GVP canvas (1A+2C)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("collects QMS signals with missing tier1–2 docs", () => {
    const sig = collectQmsSignals();
    expect(sig.enabled).toBe(true);
    expect(sig.compliance_type_id).toBe("md-qms");
    expect(sig.required).toBeGreaterThan(0);
    expect(sig.missing_required.length).toBeGreaterThan(0);
  });

  it("collects GVP signals with missing procedure docs", () => {
    const sig = collectGvpSignals();
    expect(sig.enabled).toBe(true);
    expect(sig.compliance_type_id).toBe("md-gvp");
    expect(sig.missing_required.length).toBeGreaterThan(0);
  });

  it("builds QMS/GVP portfolios without L2", () => {
    const qms = buildQmsPortfolio({ today: "2026-07-14" });
    const gvp = buildGvpPortfolio({ today: "2026-07-14" });
    expect(qms.stats.missing).toBeGreaterThan(0);
    expect(gvp.stats.missing).toBeGreaterThan(0);
    const blob = JSON.stringify({ qms, gvp });
    expect(blob).not.toMatch(/許可番号|〒\d{3}/);
  });

  it("merges qms/gvp into obligations portfolio", () => {
    const obl = buildObligationsPortfolio({ today: "2026-07-14" });
    const sources = new Set(obl.rows.map((r) => r.source));
    expect(sources.has("qms") || sources.has("gvp")).toBe(true);
    expect(
      obl.rows.some((r) => r.permit_id === "md-qms" || r.permit_id === "md-gvp")
    ).toBe(true);
  });

  it("presents compliance/qms and compliance/gvp", () => {
    for (const [viewId, assertFn] of [
      ["qms", assertComplianceQmsViewModelNoL2],
      ["gvp", assertComplianceGvpViewModelNoL2],
    ] as const) {
      const canvasDir = mkdtempSync(join(tmpdir(), `orgos-md-${viewId}-`));
      const result = syncCanvasView({
        suite: "compliance",
        viewId,
        updatedAt: "更新: 2026-07-14 21:00 JST",
        date: "2026-07-14",
        tenant: "mal",
        canvasDir,
      });
      const vm = canvasViewModelSchema.parse(result.view_model);
      expect(vm.view_id).toBe(viewId);
      assertFn(vm);
      expect(vm.sections.some((s) => s.type === "table" || s.type === "callout")).toBe(
        true
      );
    }
  });
});
