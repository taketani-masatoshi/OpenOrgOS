import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { loadModuleManifest } from "../src/lib/modules.js";
import { validateSkillRegistryFiles } from "../src/lib/skill-registry.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import {
  runJpTrademarkChecklist,
  runJpTrademarkDraft,
  runJpTrademarkShow,
  runJpTrademarkValidate,
} from "../steward/jurisdiction-packs/JP/modules/jp_trademark_application/cli/lib.js";

describe("jp_trademark_application module", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has manifest and registers CLI + skills", () => {
    const manifest = loadModuleManifest("jp_trademark_application");
    expect(manifest?.id).toBe("jp_trademark_application");
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("jp_trademark_application");
    expect(validateSkillRegistryFiles()).toEqual([]);
  });

  it("show loads seed applications on mal", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpTrademarkShow({ json: true });
    const summary = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(summary.applications).toBeGreaterThan(0);
    expect(summary.jurisdiction).toBe("JP");
    expect(summary.forms).toBeGreaterThan(0);
  });

  it("validate passes seed data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpTrademarkValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_trademark_application — trademark data OK");
    spy.mockRestore();
  });

  it("checklist passes sample application on mal", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpTrademarkChecklist({ application: "TM-2026-001", json: true });
    const result = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(result.application_id).toBe("TM-2026-001");
    expect(result.passed).toBe(true);
    expect(result.checks.some((c: { id: string; ok: boolean }) => c.id === "req-jp" && c.ok)).toBe(true);
  });

  it("draft fills company fields for standard character mark", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpTrademarkDraft({ application: "TM-2026-001", json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(data.application_id).toBe("TM-2026-001");
    expect(data.applicant_name).toContain("MAL");
    expect(data.classes).toEqual(expect.arrayContaining([35, 42]));
  });
});

describe("jp_trademark_application non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it("checklist fails jurisdiction rule on hk-demo", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpTrademarkChecklist({ application: "TM-2026-001", json: true });
    const result = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(result.passed).toBe(false);
    expect(result.checks.some((c: { id: string; ok: boolean }) => c.id === "req-jp" && !c.ok)).toBe(true);
  });
});
