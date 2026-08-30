import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import { loadEnabledIsoIds } from "../src/lib/tenant-standards.js";
import {
  assessGovernancePrinciples,
  ensureIso37000EnabledInStandards,
  isStrongPurposeText,
  markIso37000SelfDeclared,
} from "../src/lib/org/governance-principles.js";
import { collectDoctorChecks } from "../src/commands/doctor.js";

describe("governance principles · ISO 37000 (ADR 0024)", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("mal");
    delete process.env.ORGOS_ENV;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("assesses all 11 ISO 37000 principles against evidence and purpose", () => {
    const status = assessGovernancePrinciples();
    expect(status.principles_rule_ok).toBe(true);
    expect(status.control_map_ok).toBe(true);
    expect(status.standard_enabled).toBe(true);
    expect(status.purpose_ok).toBe(true);
    expect(status.principles_total).toBe(11);
    expect(status.principles_ok).toBe(11);
    expect(status.ready_for_self_declaration).toBe(true);
    expect(status.self_declared).toBe(false);
  });

  it("refuses declare when the tenant is not ready", () => {
    setTenantId("demo");
    expect(() =>
      markIso37000SelfDeclared({ signatoryName: "Test" }),
    ).toThrow(/自己宣言の前提が未充足/);
  });

  it("rejects placeholder purpose text", () => {
    expect(isStrongPurposeText("（人間が確定）")).toBe(false);
    expect(isStrongPurposeText("TBD placeholder")).toBe(false);
    expect(isStrongPurposeText("short")).toBe(false);
    expect(
      isStrongPurposeText(
        "外国人と日本人、オーナーと入居者をつなぎ、言語・文化・DX の面から不動産経営を支える。",
      ),
    ).toBe(true);
  });

  it("pack files exist on the install root", () => {
    expect(existsSync("steward/standards/iso/ISO-37000/control-map.yaml")).toBe(true);
    expect(existsSync("steward/rules/governance-principles.md")).toBe(true);
  });

  it("does not enable neighboring ISO ids when flipping ISO-37000", () => {
    const before = new Set(loadEnabledIsoIds());
    ensureIso37000EnabledInStandards();
    const after = loadEnabledIsoIds();
    expect(after).toContain("ISO-37000");
    const added = after.filter((id) => !before.has(id));
    expect(added.filter((id) => id !== "ISO-37000")).toEqual([]);
  });

  it("doctor pack check finds ISO-37000", () => {
    const { checks } = collectDoctorChecks();
    expect(checks.find((c) => c.id === "iso37000_pack")?.ok).toBe(true);
    expect(checks.find((c) => c.id === "iso_catalog_maps")?.ok).toBe(true);
  });
});
