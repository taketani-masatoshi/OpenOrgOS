import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  listEffectiveControls,
  controlsForAgent,
  computeControlGaps,
  loadControlMaps,
  hasEvidenceForControl,
} from "../src/lib/control-framework.js";
import { computeComplianceGap } from "../src/lib/compliance-gap.js";

describe("control framework", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  // Which standards a tenant certifies against is a business decision, so the
  // framework assertions below pass an explicit list rather than reading
  // whatever tenants/mal/standards.yaml happens to enable today.
  const MULTI = ["ISO-9001", "ISO-27001", "ISO-13485"];

  it("folds several standards into one control set", () => {
    const maps = loadControlMaps(MULTI);
    expect(maps.length).toBeGreaterThan(20);
    expect(maps.some((c) => c.id === "CTL-CORE-doc-control")).toBe(true);
  });

  it("the tenant's own enabled standards yield controls in scope", () => {
    const effective = listEffectiveControls().filter((c) => c.in_scope);
    expect(effective.length).toBeGreaterThan(0);
  });

  it("controlsForAgent returns only controls naming that agent", () => {
    const ctrls = controlsForAgent("compliance");
    expect(ctrls.length).toBeGreaterThan(0);
    expect(
      ctrls.every(
        (c) =>
          c.primary_agent === "compliance" ||
          c.secondary_agents?.includes("compliance")
      )
    ).toBe(true);
  });

  it("controlsForAgent internal_audit includes the core audit CTL", () => {
    const ctrls = controlsForAgent("internal_audit");
    expect(ctrls.some((c) => c.id === "CTL-CORE-internal-audit")).toBe(true);
  });

  it("doc_missing rows are L2-or-higher controls lacking evidence", () => {
    const docGaps = computeControlGaps().filter((g) => g.gap_type === "doc_missing");
    for (const g of docGaps) {
      const ctrl = listEffectiveControls().find((c) => c.id === g.control_id);
      expect(ctrl).toBeDefined();
      expect(hasEvidenceForControl(ctrl!)).toBe(false);
    }
  });

  it("evidence_mode all keeps a per-standard gap visible after folding", () => {
    const ctrl = loadControlMaps(MULTI).find((c) => c.id === "CTL-CORE-risk-approach");
    expect(ctrl?.evidence_mode).toBe("all");
    // ISO-27001 has a risk register but ISO-9001 does not: folding must not hide that.
    expect(ctrl?.evidence_paths).toContain("docs/compliance/iso/ISO-27001/risk-register.csv");
    expect(hasEvidenceForControl(ctrl!)).toBe(false);
  });

  it("hasEvidenceForControl finds existing regulation doc", () => {
    const ctrl = listEffectiveControls().find((c) => c.id === "CTL-CORE-scope");
    expect(ctrl).toBeDefined();
    if (ctrl) expect(hasEvidenceForControl(ctrl)).toBe(true);
  });

  it("core controls carry every enabled standard's clause with its edition", () => {
    const audit = loadControlMaps(MULTI).find((c) => c.id === "CTL-CORE-internal-audit");
    const refs = new Map(audit?.iso_refs.map((r) => [r.standard, r]));
    // Same work, different clause numbers — this is why work is the key.
    expect(refs.get("ISO-9001")?.clause).toBe("9.2");
    expect(refs.get("ISO-13485")?.clause).toBe("8.2.4");
    expect(refs.get("ISO-9001")?.edition).toBe("2015");
    expect(refs.get("ISO-27001")?.edition).toBe("2022");
  });
});

describe("compliance gap with controls", () => {
  beforeEach(() => {
    setTenantId("acme");
  });

  it("includes control_gaps field", () => {
    const result = computeComplianceGap();
    expect(result.control_gaps).toBeDefined();
    expect(Array.isArray(result.control_gaps)).toBe(true);
  });
});
