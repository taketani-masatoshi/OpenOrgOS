import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildOrgChartApiPayload } from "../src/lib/steward-chat/org-chart-view.js";

describe("org chart API payload (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("loads chart and layouts a diagram", () => {
    const payload = buildOrgChartApiPayload();
    expect(payload.ok).toBe(true);
    expect(payload.missing).toBe(false);
    if (payload.missing) return;
    expect(payload.company_name).toContain("MAL");
    expect(payload.nodes.length).toBeGreaterThanOrEqual(3);
    expect(payload.diagram.nodes.some((n) => n.label === "取締役会")).toBe(true);
    expect(payload.diagram.nodes.some((n) => n.label === "事業部門")).toBe(true);
    expect(payload.diagram.nodes.some((n) => n.label === "管理部門")).toBe(true);
    expect(payload.diagram.nodes.every((n) => !/段|宮城|三塚/.test(n.label))).toBe(true);
    expect(payload.diagram.edges.every((e) => (e.points?.length ?? 0) >= 2)).toBe(true);
    // Orthogonal: each segment is horizontal or vertical
    for (const e of payload.diagram.edges) {
      const pts = e.points!;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }
    expect(payload.tree_lines.some((l) => l.includes("取締役会"))).toBe(true);
    expect(payload.path).toBe("data/org/org-chart.yaml");
    expect(
      payload.units.some((u) => u.members.some((m) => m.name === "段燕燕" && m.login_id_ready))
    ).toBe(true);
    expect(
      payload.units.some((u) => u.members.some((m) => m.name.includes("宮城万貴子") && !m.login_id_ready))
    ).toBe(true);
    expect(
      payload.units.some((u) => u.unit_label === "事業部門" && u.members.some((m) => m.name === "三塚力"))
    ).toBe(true);
    expect(payload.users.some((u) => u.name === "段燕燕" && u.operator_id === "OP-001")).toBe(true);
    expect(
      payload.advisors.some((a) => a.kind === "legal" && a.name === "松尾剛行" && a.contract_id === "CTR-022")
    ).toBe(true);
    expect(payload.advisors.some((a) => a.kind === "tax" && a.status === "none")).toBe(true);
    expect(payload.advisors.some((a) => a.kind === "technical" && a.status === "none")).toBe(true);
    expect(JSON.stringify(payload.units)).not.toMatch(/〒|千代田区|k\.lab\.masa|sha256:/);
    expect(JSON.stringify(payload.advisors)).not.toMatch(/@|EXT-005|mmn-law/);
    expect(payload.agents.operational.some((a) => a.id === "executive_steward")).toBe(true);
    expect(payload.agents.operational.some((a) => a.id === "secretary")).toBe(true);
  });
});

describe("org chart API payload (demo)", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("includes company chart, history, and running agents", () => {
    const payload = buildOrgChartApiPayload();
    expect(payload.ok).toBe(true);
    expect(payload.missing).toBe(false);
    if (payload.missing) return;
    expect(payload.company_name).toContain("デモ");
    expect(payload.as_of).toBe("2026-08-01");
    expect(payload.history.some((h) => h.as_of === "2026-01-15")).toBe(true);
    expect(payload.agents.operational.some((a) => a.id === "executive_steward")).toBe(true);
    expect(payload.agents.operational.some((a) => a.label.includes("秘書") || a.id === "secretary")).toBe(
      true,
    );
    expect(payload.advisors).toHaveLength(3);
    expect(payload.advisors.every((a) => a.status === "none")).toBe(true);
  });

  it("loads a past board record by as_of", () => {
    const payload = buildOrgChartApiPayload({ asOf: "2026-01-15" });
    expect(payload.missing).toBe(false);
    if (payload.missing) return;
    expect(payload.is_historical).toBe(true);
    expect(payload.as_of).toBe("2026-01-15");
    expect(payload.nodes.some((n) => n.id === "business-unit")).toBe(false);
    expect(payload.diagram.nodes.some((n) => n.label === "取締役会")).toBe(true);
  });
});
