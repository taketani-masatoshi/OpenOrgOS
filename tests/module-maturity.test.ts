import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildModuleMaturityPanel } from "../src/lib/module-maturity/build-panel.js";
import {
  operatorShellTabFromRoute,
  pathActive,
  spaPathFromHref,
} from "../apps/steward-chat/src/console-routing.js";

describe("buildModuleMaturityPanel", () => {
  it("returns catalog summary and core lanes with surface/load for mal", () => {
    setTenantId("mal");
    const panel = buildModuleMaturityPanel();
    expect(panel.ok).toBe(true);
    expect(panel.tenant).toBe("mal");
    expect(panel.summary.catalog_total).toBeGreaterThan(0);
    expect(panel.summary.enabled).toBeGreaterThan(0);
    expect(panel.summary.risk_count).toBe(panel.risks.length);
    expect(panel.summary.risk_skeleton_count).toBeGreaterThanOrEqual(0);
    expect(panel.lanes.map((l) => l.id)).toEqual([
      "secretary",
      "mail",
      "task",
      "wire",
      "property_ops",
    ]);
    for (const lane of panel.lanes) {
      expect(lane.href.length).toBeGreaterThan(0);
      expect(["missing", "thin", "operational", "closed"]).toContain(lane.level);
      expect(["ready", "missing"]).toContain(lane.surface);
      expect(["idle", "active"]).toContain(lane.load);
      expect(lane.label_key.startsWith("lane.")).toBe(true);
    }
    for (const risk of panel.risks) {
      expect(risk.enabled).toBe(true);
      expect(risk.tier).not.toBe("production_ready");
      expect(risk.risk).toBe(true);
      expect(["skeleton_enabled", "activation_enabled"]).toContain(
        risk.risk_severity,
      );
    }
    // Empty queues can still be operational (surface ready)
    const secretary = panel.lanes.find((l) => l.id === "secretary");
    if (secretary?.surface === "ready") {
      expect(["operational", "closed", "thin"]).toContain(secretary.level);
    }
  });
});

describe("console-routing module maturity", () => {
  it("resolves /modules/maturity/ before /modules/", () => {
    expect(pathActive("/modules/maturity")).toBe("module-maturity");
    expect(pathActive("/modules/maturity/")).toBe("module-maturity");
    expect(pathActive("/modules/")).toBe("module-list");
    expect(operatorShellTabFromRoute("module-maturity")).toBe("module-list");
    expect(spaPathFromHref("/modules/maturity/", "http://localhost")).toBe(
      "/modules/maturity/",
    );
  });
});
