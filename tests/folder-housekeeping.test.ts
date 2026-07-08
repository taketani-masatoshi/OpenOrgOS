import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  runHousekeepingChecks,
  applyHousekeepingFixes,
} from "../src/lib/folder-housekeeping.js";

describe("folder-housekeeping", () => {
  it("detects and fixes empty cursor dir and root tgz", () => {
    const root = mkdtempSync(join(tmpdir(), "orgos-hk-"));
    mkdirSync(join(root, "cursor"));
    writeFileSync(join(root, "orgos-cli-0.0.0.tgz"), "x");
    mkdirSync(join(root, "data"));
    writeFileSync(join(root, "data", "00-README.md"), "ok");

    const findings = runHousekeepingChecks(root);
    expect(findings.some((f) => f.id === "root_cursor_dir" && !f.ok)).toBe(true);
    expect(findings.some((f) => f.id === "root_tgz" && !f.ok)).toBe(true);

    const fixed = applyHousekeepingFixes(findings, root);
    expect(fixed.length).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(root, "cursor"))).toBe(false);
    expect(existsSync(join(root, "orgos-cli-0.0.0.tgz"))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("detects legacy tenant csv when exports canonical exists", () => {
    const root = mkdtempSync(join(tmpdir(), "orgos-hk-"));
    const tenantDocs = join(root, "tenants", "demo", "docs");
    mkdirSync(join(root, "tenants", "demo"), { recursive: true });
    writeFileSync(join(root, "tenants", "demo", "tenant.yaml"), "id: demo\n");
    mkdirSync(join(tenantDocs, "data"), { recursive: true });
    mkdirSync(join(tenantDocs, "exports"), { recursive: true });
    writeFileSync(join(tenantDocs, "data", "test.csv"), "a");
    writeFileSync(join(tenantDocs, "exports", "test.csv"), "b");
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(join(root, "data", "00-README.md"), "ok");

    const findings = runHousekeepingChecks(root);
    expect(findings.some((f) => f.id === "tenant_legacy_csv" && !f.ok)).toBe(true);

    applyHousekeepingFixes(findings, root);
    expect(existsSync(join(tenantDocs, "data", "test.csv"))).toBe(false);
    expect(existsSync(join(tenantDocs, "data", "00-このフォルダについて.md"))).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });
});
