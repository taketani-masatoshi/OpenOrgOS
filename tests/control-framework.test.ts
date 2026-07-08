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

  it("mal loads controls for enabled ISO standards", () => {
    const maps = loadControlMaps();
    expect(maps.length).toBeGreaterThan(20);
    const effective = listEffectiveControls().filter((c) => c.in_scope);
    expect(effective.length).toBeGreaterThan(10);
  });

  it("controlsForAgent compliance includes cross-domain CTL", () => {
    const ctrls = controlsForAgent("compliance");
    expect(ctrls.some((c) => c.id === "CTL-CORE-doc-control")).toBe(true);
  });

  it("controlsForAgent internal_audit includes audit CTL", () => {
    const ctrls = controlsForAgent("internal_audit");
    expect(ctrls.some((c) => c.id === "CTL-9001-9.2")).toBe(true);
  });

  it("doc_missing when L2+ without evidence file", () => {
    const gaps = computeControlGaps();
    const docGaps = gaps.filter((g) => g.gap_type === "doc_missing");
    expect(docGaps.some((g) => g.control_id === "CTL-9001-6.1")).toBe(true);
  });

  it("hasEvidenceForControl finds existing regulation doc", () => {
    const ctrl = listEffectiveControls().find((c) => c.id === "CTL-9001-4.3");
    expect(ctrl).toBeDefined();
    if (ctrl) expect(hasEvidenceForControl(ctrl)).toBe(true);
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
