/**
 * Catalog module test template — copy to tests/{catalog-id}.test.ts or tests/catalog/{id}.test.ts
 *
 * Path: tests/catalog/_template.example.ts
 * After adding tests: npm run test:registry:sync
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../../src/lib/tenant.js";
import {
  checkModuleCatalogOnly,
  loadModuleManifest,
} from "../../src/lib/modules.js";

/** Replace with catalog id from steward/modules/readiness.yaml */
const CATALOG_ID = "clinic";

describe(`catalog module ${CATALOG_ID}`, () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has manifest matching catalog id", () => {
    const manifest = loadModuleManifest(CATALOG_ID);
    expect(manifest?.id).toBe(CATALOG_ID);
  });

  it("passes catalog-only readiness check for its tier", () => {
    const issues = checkModuleCatalogOnly(CATALOG_ID, "production_ready");
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });
});
