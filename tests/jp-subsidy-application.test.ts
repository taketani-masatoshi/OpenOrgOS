import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { loadModuleManifest } from "../src/lib/modules.js";
import { validateSkillRegistryFiles } from "../src/lib/skill-registry.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import {
  runJpSubsidyDraft,
  runJpSubsidyEligibility,
  runJpSubsidyLaborCost,
  runJpSubsidyShow,
} from "../steward/jurisdiction-packs/JP/modules/jp_subsidy_application/cli/lib.js";

describe("jp_subsidy_application module", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has manifest and registers CLI + skills", () => {
    const manifest = loadModuleManifest("jp_subsidy_application");
    expect(manifest?.id).toBe("jp_subsidy_application");
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("jp_subsidy_application");
    expect(validateSkillRegistryFiles()).toEqual([]);
  });

  it("show loads seed programs on mal", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpSubsidyShow({ json: true });
    const summary = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(summary.programs).toBeGreaterThan(0);
    expect(summary.jurisdiction).toBe("JP");
  });

  it("eligibility passes sample program against mal company metadata", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpSubsidyEligibility({ program: "SUB-2026-001", json: true });
    const result = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(result.program_id).toBe("SUB-2026-001");
    expect(result.passed).toBe(true);
    expect(result.checks.some((c: { id: string; ok: boolean }) => c.id === "req-corp-no" && c.ok)).toBe(
      true
    );
  });

  it("labor-cost builds rows from seed basis", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpSubsidyLaborCost({ program: "SUB-2026-001", json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows[0].allocated_monthly_yen).toBeGreaterThan(0);
  });

  it("draft fills company fields from field-map", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpSubsidyDraft({ program: "SUB-2026-001", json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    const name = data.fields.find((f: { source: string }) => f.source === "company.name");
    expect(name?.value).toContain("MAL");
  });
});

describe("jp_subsidy_application non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it("eligibility fails jurisdiction rule on hk-demo", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    runJpSubsidyEligibility({ program: "SUB-2026-001", json: true });
    const result = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    exit.mockRestore();
    expect(result.passed).toBe(false);
    expect(result.checks.some((c: { rule?: string; id: string; ok: boolean }) => c.id === "req-jp" && !c.ok)).toBe(
      true
    );
  });
});
