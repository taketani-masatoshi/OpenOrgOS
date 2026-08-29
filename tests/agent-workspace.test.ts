import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  activateTenantModule,
  ensureAgentWorkspace,
} from "../src/lib/agent-workspace.js";
import { computeAgentReadiness } from "../src/lib/agent-readiness.js";
import { controlsForAgent } from "../src/lib/control-framework.js";
import { listEffectiveRegulations } from "../src/lib/regulations.js";
import { loadEnabledIsoIds } from "../src/lib/tenant-standards.js";
import { getTenantDir, setTenantId } from "../src/lib/tenant.js";
import { resolveTenantPath } from "../src/lib/utils.js";

/**
 * activateTenantModule writes to the tenant SSOT. Without a restore, a plain
 * `vitest run` would leave the company's enabled standards and regulations
 * changed — the test would be editing real compliance configuration.
 */
const MUTATED_SSOT = ["standards.yaml", "modules.yaml", "regulations.yaml"];

describe("agent workspace init", () => {
  let snapshot: Map<string, string>;

  beforeEach(() => {
    setTenantId("mal");
    snapshot = new Map();
    // These live at the tenant root, which resolveTenantPath does not map.
    for (const rel of MUTATED_SSOT) {
      const path = join(getTenantDir(), rel);
      if (!existsSync(path)) throw new Error(`missing tenant SSOT: ${rel}`);
      snapshot.set(path, readFileSync(path, "utf-8"));
    }
  });

  afterEach(() => {
    for (const [path, content] of snapshot) writeFileSync(path, content, "utf-8");
  });

  it("creates medical_device_regulatory folders on agent order hook path", () => {
    const quality = resolveTenantPath("docs/quality");
    if (existsSync(quality)) rmSync(quality, { recursive: true, force: true });

    const result = ensureAgentWorkspace("medical_device_regulatory");
    expect(result.created.some((p) => p.includes("docs/quality"))).toBe(true);
    expect(existsSync(quality)).toBe(true);
  });

  it("activates jp_medical_device with ISO · REG · workspace on mal", () => {
    const result = activateTenantModule("jp_medical_device");
    expect(result.module.enabled).toBe(true);
    expect(loadEnabledIsoIds()).toContain("ISO-13485");
    const effectiveRegs = listEffectiveRegulations()
      .filter((r) => r.effective)
      .map((r) => r.id);
    expect(effectiveRegs).toEqual(expect.arrayContaining(["REG-025", "REG-026"]));
    expect(existsSync(resolveTenantPath("docs/quality"))).toBe(true);
    expect(existsSync(resolveTenantPath("docs/medical-device/gvp"))).toBe(true);
    expect(existsSync(resolveTenantPath("docs/company/regulations/iryo-kiki-qms-kisoku.md"))).toBe(
      true
    );

    const readiness = computeAgentReadiness("medical_device_regulatory");
    // During `test:tiered`, the execution-evidence marker is intentionally
    // cleared until every tier passes, so activation itself must not assume
    // the final 4 evidence points are already available.
    expect(readiness.pct).toBeGreaterThanOrEqual(96);
    expect(readiness.axes.find((a) => a.id === "data_sot")?.score).toBe(15);

    const controls = controlsForAgent("medical_device_regulatory");
    expect(controls.some((c) => c.id.startsWith("CTL-13485"))).toBe(true);
  });
});
