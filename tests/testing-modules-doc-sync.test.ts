import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countStaticTestCases,
  loadTestRegistry,
  listTestFilesOnDisk,
} from "./test-registry.js";

const root = join(import.meta.dirname, "..");
const docPath = join(root, "steward/rules/testing-modules.md");

describe("testing-modules doc sync", () => {
  it("documents vitest file count matching registry", () => {
    const text = readFileSync(docPath, "utf-8");
    const match = text.match(/\|\s*Vitest テストファイル\s*\|\s*\*\*(\d+)\*\*/);
    expect(match, "testing-modules.md should table **NNN** vitest files").toBeTruthy();
    expect(Number(match![1])).toBe(listTestFilesOnDisk().length);
  });

  it("documents the exact static test count from registry", () => {
    const registry = loadTestRegistry();
    const text = readFileSync(docPath, "utf-8");
    const match = text.match(/静的 `it`\/`test` \*\*(\d+)\*\*/);
    expect(match, "testing-modules.md should document static test count").toBeTruthy();
    expect(Number(match![1])).toBe(registry.stats.static_test_cases);
    expect(registry.stats.static_test_cases).toBe(countStaticTestCases());
  });

  it("documents catalog_gap zero when registry has no gaps", () => {
    const registry = loadTestRegistry();
    const text = readFileSync(docPath, "utf-8");
    if (registry.stats.catalog_gap === 0) {
      expect(text).toMatch(/catalog coverage gap[^\n]*\|\s*\*\*0\*\*/);
    }
  });

  it("documents the catalog module count from the registry", () => {
    const text = readFileSync(docPath, "utf-8");
    const match = text.match(/業務 catalog module[^\n]*\*\*(\d+)\*\*/);
    expect(match, "testing-modules.md should table **NNN** catalog modules").toBeTruthy();
    expect(Number(match![1])).toBe(loadTestRegistry().stats.catalog_total);
  });

  it("documents catalog tier counts matching registry stats", () => {
    const registry = loadTestRegistry();
    const text = readFileSync(docPath, "utf-8");
    const dedicated = text.match(/catalog dedicated[^\n]*\*\*(\d+)\*\*/);
    const bundled = text.match(/catalog bundled[^\n]*\*\*(\d+)\*\*/);
    const catalogOnly = text.match(/catalog_only[^\n]*\*\*(\d+)\*\*/);
    expect(Number(dedicated![1])).toBe(registry.stats.catalog_dedicated);
    expect(Number(bundled![1])).toBe(registry.stats.catalog_bundled);
    expect(Number(catalogOnly![1])).toBe(registry.stats.catalog_only);
  });
});
