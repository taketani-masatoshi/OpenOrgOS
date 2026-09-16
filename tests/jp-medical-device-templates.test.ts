import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  medicalDeviceGvpCatalogFileSchema,
  medicalDeviceQmsCatalogFileSchema,
} from "../schemas/jp-medical-device.js";
import { applyRegulationPlaceholders, seedRegulationDocs } from "../src/lib/regulations.js";
import { getModuleSeedDir } from "../src/lib/modules.js";
import { setTenantId } from "../src/lib/tenant.js";
import { fillTemplate, buildTemplateVars, resolveTemplatePath } from "../steward/jurisdiction-packs/JP/modules/jp_medical_device/cli/shared.js";
import { loadModuleDataFile } from "../src/lib/module-business-data.js";

const MODULE_ID = "jp_medical_device";

describe("jp_medical_device document templates", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("ships a complete template for every catalog document", () => {
    const seed = getModuleSeedDir(MODULE_ID);
    const qms = loadModuleDataFile(MODULE_ID, "qms-catalog.yaml", medicalDeviceQmsCatalogFileSchema);
    const gvp = loadModuleDataFile(MODULE_ID, "gvp-catalog.yaml", medicalDeviceGvpCatalogFileSchema);
    expect(qms).toBeTruthy();
    expect(gvp).toBeTruthy();
    const docs = [...(qms?.data.documents ?? []), ...(gvp?.data.documents ?? [])];
    expect(docs.length).toBeGreaterThanOrEqual(19);
    for (const doc of docs) {
      const abs = resolveTemplatePath(doc.template);
      expect(abs, doc.template).toBeTruthy();
      const text = readFileSync(abs!, "utf-8");
      expect(text.length, doc.id).toBeGreaterThan(300);
      expect(text.includes("{{doc_number}}") || text.includes("{{company.name}}"), doc.id).toBe(
        true
      );
      expect(text, doc.id).not.toMatch(/株式会社MAL/);
    }
    const templateRoot = join(seed, "templates");
    expect(existsSync(join(templateRoot, "README.md"))).toBe(true);
    const qmsFiles = readdirSync(join(templateRoot, "qms")).filter((f) => f.endsWith(".md"));
    expect(qmsFiles.length).toBeGreaterThanOrEqual(12);
  });

  it("fills company name from company.yaml, not a hardcoded tenant", () => {
    const raw = readFileSync(resolveTemplatePath("templates/qms/tier1-quality-manual.md")!, "utf-8");
    const filled = fillTemplate(raw, buildTemplateVars("QMS-MAN-001"));
    expect(filled).toContain("株式会社MAL");
    expect(filled).not.toContain("{{company.name}}");
    expect(filled).toContain("QMS-MAN-001");
  });

  it("substitutes {{company.name}} in REG-025/026 without a TBD stub footer", () => {
    const qms = readFileSync(
      join(
        process.cwd(),
        "steward/jurisdiction-packs/JP/regulations/templates/by-module/jp_medical_device/REG-025-iryo-kiki-qms/template.md"
      ),
      "utf-8"
    );
    const gvp = readFileSync(
      join(
        process.cwd(),
        "steward/jurisdiction-packs/JP/regulations/templates/by-module/jp_medical_device/REG-026-iryo-kiki-gvp/template.md"
      ),
      "utf-8"
    );
    expect(qms).toContain("第14条");
    expect(gvp).toContain("第12条");
    const enacted = applyRegulationPlaceholders(qms, "株式会社MAL");
    expect(enacted).toContain("株式会社MAL");
    expect(enacted).not.toContain("{{company.name}}");
    expect(enacted).not.toMatch(/\[TBD\]/);
    expect(applyRegulationPlaceholders(gvp, "株式会社サンプル商事")).toContain("株式会社サンプル商事");
  });

  it("seeds only the regulation ids passed to seedRegulationDocs", () => {
    const result = seedRegulationDocs({
      ids: ["REG-025", "REG-026"],
      dryRun: true,
      force: true,
    });
    expect(result.seeded).toEqual(["REG-025", "REG-026"]);
    expect(result.missing).toEqual([]);
  });
});
