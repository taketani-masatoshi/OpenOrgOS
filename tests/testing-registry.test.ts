import { describe, expect, it } from "vitest";
import {
  assertAllTestsRegistered,
  buildRegistryFromDisk,
  listTestFilesOnDisk,
  loadTestRegistry,
  listTestsForCiSuite,
} from "./test-registry.js";

describe("testing registry", () => {
  it("maps every tests/*.test.ts file", () => {
    const disk = listTestFilesOnDisk();
    const registry = loadTestRegistry();
    expect(Object.keys(registry.tests).length).toBe(disk.length);
    const result = assertAllTestsRegistered(registry);
    expect(result.missingInRegistry, result.missingInRegistry.join(", ")).toEqual([]);
    expect(result.missingOnDisk, result.missingOnDisk.join(", ")).toEqual([]);
  });

  it("matches vitest_total stat", () => {
    const registry = loadTestRegistry();
    expect(registry.stats.vitest_total).toBe(listTestFilesOnDisk().length);
  });

  it("declares 29 catalog modules", () => {
    const registry = loadTestRegistry();
    expect(Object.keys(registry.catalog_modules).length).toBe(29);
    expect(registry.stats.catalog_total).toBe(29);
  });

  it("built registry from disk matches committed yaml", () => {
    const built = buildRegistryFromDisk();
    const loaded = loadTestRegistry();
    expect(Object.keys(built.tests).sort()).toEqual(Object.keys(loaded.tests).sort());
    for (const file of Object.keys(built.tests)) {
      expect(loaded.tests[file]?.axis).toBe(built.tests[file]?.axis);
    }
  });

  it("security-rbac CI suite files exist on disk", () => {
    const files = listTestsForCiSuite("security-rbac");
    expect(files.length).toBe(10);
    for (const f of files) {
      expect(listTestFilesOnDisk()).toContain(f);
    }
  });

  it("wire-gateway-smoke CI suite includes governance tests", () => {
    const files = listTestsForCiSuite("wire-gateway-smoke");
    expect(files).toContain("wire-trust-registry-governance.test.ts");
    expect(files).toContain("wire-node-pk-did-governance.test.ts");
    expect(files.length).toBe(26);
  });

  it("steward-chat-smoke CI suite has 28 vitest files", () => {
    const files = listTestsForCiSuite("steward-chat-smoke");
    expect(files.length).toBe(28);
  });
});
