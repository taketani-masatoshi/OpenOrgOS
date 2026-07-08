import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import { loadModuleManifest } from "../src/lib/modules.js";
import { validateSkillRegistryFiles } from "../src/lib/skill-registry.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import { resolveTenantPath } from "../src/lib/utils.js";
import {
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
  loadCompanyEvents,
  saveCompanyEvents,
} from "../src/lib/company-events.js";
import {
  runJpCorporateChecklist,
  runJpCorporateDraft,
  runJpCorporatePrepare,
  runJpCorporateProcedures,
  runJpCorporateShow,
  runJpCorporateValidate,
} from "../steward/jurisdiction-packs/JP/modules/jp_corporate_registration/cli/lib.js";

describe("jp_corporate_registration module", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has manifest and registers CLI + skills", () => {
    const manifest = loadModuleManifest("jp_corporate_registration");
    expect(manifest?.id).toBe("jp_corporate_registration");
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("jp_corporate_registration");
    expect(validateSkillRegistryFiles()).toEqual([]);
  });

  it("lists Legal Affairs Bureau procedures", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpCorporateProcedures({ json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(data.count).toBeGreaterThanOrEqual(18);
    expect(data.procedures.some((p: { id: string }) => p.id === "incorporation")).toBe(true);
    expect(data.procedures.some((p: { id: string }) => p.id === "dissolution")).toBe(true);
  });

  it("show loads seed cases on mal", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpCorporateShow({ json: true });
    const summary = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(summary.procedures).toBeGreaterThanOrEqual(18);
    expect(summary.cases).toBeGreaterThan(0);
    expect(summary.jurisdiction).toBe("JP");
  });

  it("validate passes seed data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpCorporateValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_corporate_registration — corporate registration data OK");
    spy.mockRestore();
  });

  it("checklist passes incorporation case", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpCorporateChecklist({ case: "INC-2026-001", json: true });
    const result = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(result.case_id).toBe("INC-2026-001");
    expect(result.procedure_id).toBe("incorporation");
    expect(result.checks.some((c: { id: string; ok: boolean }) => c.id === "inc-name" && c.ok)).toBe(true);
  });

  it("draft generates teikan for incorporation", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpCorporateDraft({ case: "INC-2026-001", form: "form-teikan-kk", json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(data.case_id).toBe("INC-2026-001");
    expect(data.outputs).toHaveLength(1);
    expect(data.outputs[0].name).toBe("teikan-kk.md");
  });

  it("draft generates all forms for trade name change", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpCorporateDraft({ case: "CHG-2026-001", json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(data.outputs.length).toBeGreaterThanOrEqual(3);
  });

  it("prepare generates filing pack with index for procedure", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpCorporatePrepare({ procedure: "dissolution", json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(data.packs).toHaveLength(1);
    expect(data.packs[0].procedure_id).toBe("dissolution");
    expect(data.packs[0].outputs.some((o: { name: string }) => o.name === "00-filing-pack-index.md")).toBe(
      true
    );
    expect(data.packs[0].outputs.length).toBeGreaterThanOrEqual(3);
  });

  it("prepare --all lists every registry case", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpCorporatePrepare({ all: true, json: true });
    const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(data.packs.length).toBeGreaterThanOrEqual(18);
  });

  it("prepare --write --event-id writes to company event artifact dir", () => {
    initCompanyEventsFile();
    ensureCompanyEventMonth("2099-11");
    const event = createCompanyEvent({
      kind: "registration",
      title: "JP prepare link test",
      occurredAt: "2099-11-15",
      slug: "jp-prepare-link",
      related: { registration_case_id: "INC-2026-001" },
    });

    try {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      runJpCorporatePrepare({
        case: "INC-2026-001",
        write: true,
        eventId: event.id,
        json: true,
      });
      const data = JSON.parse(String(spy.mock.calls[0]?.[0]));
      spy.mockRestore();

      expect(data.packs).toHaveLength(1);
      expect(
        data.packs[0].outputs.some((o: { name: string }) => o.name === "00-filing-pack-index.md")
      ).toBe(true);
      expect(
        existsSync(resolveTenantPath(`${event.artifact_dir}00-filing-pack-index.md`))
      ).toBe(true);
    } finally {
      const registry = loadCompanyEvents();
      registry.events = registry.events.filter((e) => e.id !== event.id);
      saveCompanyEvents(registry);
      for (const rel of [event.event_path, event.artifact_dir]) {
        const abs = resolveTenantPath(rel);
        if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
      }
    }
  });
});

describe("jp_corporate_registration non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it("checklist fails jurisdiction on hk-demo", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpCorporateChecklist({ case: "INC-2026-001", json: true });
    const result = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(result.checks.some((c: { id: string; ok: boolean }) => c.id === "req-jp" && !c.ok)).toBe(true);
  });
});
