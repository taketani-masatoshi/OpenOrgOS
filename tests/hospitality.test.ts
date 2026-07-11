import { beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { getModuleTier } from "../src/lib/module-readiness.js";
import {
  checkModuleCatalogOnly,
  loadModuleManifest,
} from "../src/lib/modules.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import {
  checkOperationsRecords,
  formatRecordsCheck,
} from "../steward/modules/hospitality/cli/records-check.js";

describe("hospitality module", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has manifest and registers CLI bundle", () => {
    const manifest = loadModuleManifest("hospitality");
    expect(manifest?.id).toBe("hospitality");
    expect(getModuleTier("hospitality")).toBe("production_ready");
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("hospitality");
  });

  it("passes catalog-only readiness check", () => {
    const issues = checkModuleCatalogOnly("hospitality", "production_ready");
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });

  it("records-check runs without error on mal tenant", () => {
    const result = checkOperationsRecords();
    const md = formatRecordsCheck(result);
    expect(md).toContain("operations/records チェック");
    expect(typeof result.totalRows).toBe("number");
  });
});
