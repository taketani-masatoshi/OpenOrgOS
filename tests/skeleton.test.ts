import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { isSkeletonTenant } from "../src/lib/ops-config.js";
import { computeMaturityReport } from "../src/lib/maturity.js";
import { checkModule } from "../src/lib/modules.js";

const root = join(import.meta.dirname, "..");

function steward(args: string[], tenant?: string): string {
  const env = tenant ? { ...process.env, STEWARD_TENANT: tenant } : process.env;
  return execFileSync("npm", ["run", "steward", "--", ...args], {
    cwd: root,
    encoding: "utf-8",
    env,
  });
}

describe("skeleton CLI", () => {
  it("modules check restaurant exits 1 on missing seeds", () => {
    expect(() => {
      execFileSync("npm", ["run", "steward", "--", "modules", "check", "restaurant"], {
        cwd: root,
        encoding: "utf-8",
        stdio: "pipe",
      });
    }).toThrow();
    const issues = checkModule("restaurant");
    expect(issues.length).toBeGreaterThan(0);
  });

  it("modules check rental passes", () => {
    const out = steward(["modules", "check", "rental"]);
    expect(out).toContain("manifest OK");
  });

  it("regulations and standards CLI are registered", () => {
    const help = execFileSync("npm", ["run", "steward", "--", "--help"], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(help).toContain("regulations");
    expect(help).toContain("standards");
    expect(help).toContain("tenant");
  });

  it("demo invoice generate --dry-run prints paths without billing", () => {
    const out = steward(
      [
        "invoice",
        "generate",
        "--module",
        "rental",
        "--property",
        "PROP-001",
        "--from",
        "2026-02",
        "--to",
        "2026-02",
        "--fy",
        "FY2098",
        "--dry-run",
      ],
      "demo"
    );
    expect(out).toContain("dry-run");
    expect(out).toContain("prop-001");
    expect(out).not.toContain("bancho");
  });

  it("demo skeleton status shows operational N/A", () => {
    setTenantId("demo");
    expect(isSkeletonTenant()).toBe(true);
    const report = computeMaturityReport();
    expect(report.operational.na).toBe(true);
    expect(report.operational.pct).toBeNull();
    const text = steward(["status"], "demo");
    expect(text).toContain("—");
    expect(text).not.toContain("84%");
  });
});

describe("tenant init", () => {
  const acmeDir = join(root, "tenants", "acme-init-test");

  it("creates validate-able tenant from _template", () => {
    if (existsSync(acmeDir)) rmSync(acmeDir, { recursive: true, force: true });
    steward(["tenant", "init", "acme-init-test", "--name", "ACME Test", "--from", "rental"]);
    expect(existsSync(join(acmeDir, "tenant.yaml"))).toBe(true);
    steward(["validate"], "acme-init-test");
    rmSync(acmeDir, { recursive: true, force: true });
  });
});
