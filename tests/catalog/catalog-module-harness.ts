import { beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTenantId } from "../../src/lib/tenant.js";
import { getModuleTier } from "../../src/lib/module-readiness.js";
import { loadInvoiceTemplate } from "../../src/lib/invoice-config.js";
import {
  checkModuleCatalogOnly,
  getModuleSeedDir,
  listModuleSeedFiles,
  loadModuleManifest,
  resolveModuleLocation,
} from "../../src/lib/modules.js";

/** Shared catalog-only module tests (manifest · seed · readiness · seed/validate.ts). */
export function describeCatalogModule(catalogId: string): void {
  describe(`catalog module ${catalogId}`, () => {
    beforeEach(() => {
      setTenantId("mal");
    });

    it("has manifest matching catalog id", () => {
      const manifest = loadModuleManifest(catalogId);
      expect(manifest?.id).toBe(catalogId);
    });

    it("resolves steward module location", () => {
      const loc = resolveModuleLocation(catalogId);
      expect(loc?.catalogId).toBe(catalogId);
      expect(existsSync(join(loc!.rootDir, "module.manifest.yaml"))).toBe(true);
    });

    it("has seed directory with files", () => {
      const seedDir = getModuleSeedDir(catalogId);
      expect(existsSync(seedDir)).toBe(true);
      expect(listModuleSeedFiles(catalogId).length).toBeGreaterThan(0);
    });

    it("required_seeds from manifest exist on disk", () => {
      const manifest = loadModuleManifest(catalogId);
      const seedDir = getModuleSeedDir(catalogId);
      for (const seed of manifest?.required_seeds ?? []) {
        expect(existsSync(join(seedDir, seed)), `missing seed ${seed}`).toBe(true);
      }
    });

    it("validates invoice template seeds via invoice-config", () => {
      const manifest = loadModuleManifest(catalogId);
      const invoiceYaml = manifest?.required_seeds?.find(
        (s) => s.startsWith("invoice-") && s.endsWith(".yaml")
      );
      if (!invoiceYaml) return;
      const templateId = invoiceYaml.replace(/^invoice-/, "").replace(/\.yaml$/, "");
      const template = loadInvoiceTemplate(catalogId, templateId);
      expect(template.id).toBe(templateId);
      expect(template.module).toBe(catalogId);
      expect(template.email.subject.length).toBeGreaterThan(0);
    });

    it("validates business seeds via module seed/validate.ts", async () => {
      const validatorPath = join(getModuleSeedDir(catalogId), "validate.ts");
      expect(existsSync(validatorPath), `missing ${validatorPath}`).toBe(true);
      const module = (await import(pathToFileURL(validatorPath).href)) as {
        validateModuleSeeds?: (seedDir: string) => void;
      };
      expect(module.validateModuleSeeds).toBeTypeOf("function");
      module.validateModuleSeeds!(getModuleSeedDir(catalogId));
    });

    it("passes catalog-only readiness check for its tier", () => {
      const tier = getModuleTier(catalogId);
      const issues = checkModuleCatalogOnly(catalogId, tier);
      expect(issues, JSON.stringify(issues)).toEqual([]);
    });
  });
}
