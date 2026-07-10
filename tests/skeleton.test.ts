import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { isSkeletonTenant } from "../src/lib/ops-config.js";
import { computeMaturityReport } from "../src/lib/maturity.js";

const root = join(import.meta.dirname, "..");

function orgos(args: string[], tenant?: string): string {
  const env = tenant
    ? { ...process.env, ORGOS_TENANT: tenant, STEWARD_TENANT: tenant }
    : process.env;
  return execFileSync("npm", ["run", "orgos", "--", ...args], {
    cwd: root,
    encoding: "utf-8",
    env,
  });
}

describe("skeleton CLI", () => {
  it("modules check restaurant passes with skeleton seeds", () => {
    const out = orgos(["modules", "check", "restaurant"]);
    expect(out).toContain("manifest OK");
  });

  it("modules check rental passes", () => {
    const out = orgos(["modules", "check", "rental"]);
    expect(out).toContain("manifest OK");
  });

  it(
    "modules check --all passes for full catalog",
    () => {
      const out = orgos(["modules", "check", "--all"]);
      expect(out).toContain("catalog modules OK");
      expect(out).toMatch(/production_ready/);
      expect(out).toMatch(/activation_ready/);
    },
    20_000
  );

  it("invoice bancho command is removed", () => {
    const help = execFileSync("npm", ["run", "orgos", "--", "invoice", "--help"], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(help).not.toContain("bancho");
    expect(() => {
      execFileSync("npm", ["run", "orgos", "--", "invoice", "bancho", "--from", "2026-02", "--to", "2026-02"], {
        cwd: root,
        encoding: "utf-8",
        stdio: "pipe",
      });
    }).toThrow();
  });

  it("regulations and standards CLI are registered", () => {
    const help = execFileSync("npm", ["run", "orgos", "--", "--help"], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(help).toContain("regulations");
    expect(help).toContain("standards");
    expect(help).toContain("tenant");
  });

  it("demo invoice generate --dry-run prints paths without billing", () => {
    const out = orgos(
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

  it(
    "demo skeleton status shows operational N/A",
    () => {
      setTenantId("demo");
      expect(isSkeletonTenant()).toBe(true);
      const report = computeMaturityReport();
      expect(report.operational.na).toBe(true);
      expect(report.operational.pct).toBeNull();
      const text = orgos(["status"], "demo");
      expect(text).toContain("—");
      expect(text).not.toContain("84%");
    },
    15_000
  );

  it(
    "demo dashboard skips hospitality module summary",
    () => {
      const out = orgos(["dashboard"], "demo");
      expect(out).not.toContain("agent-summaries/hospitality");
    },
    20_000
  );

  it("demo modules check has no bind conflicts", () => {
    const out = orgos(["modules", "check", "rental"], "demo");
    expect(out).toContain("manifest OK");
  });
});

describe("tenant init", () => {
  const acmeDir = join(root, "tenants", "acme-init-test");

  it("creates validate-able tenant from _template", () => {
    if (existsSync(acmeDir)) rmSync(acmeDir, { recursive: true, force: true });
    orgos(["tenant", "init", "acme-init-test", "--name", "ACME Test", "--from", "rental"]);
    expect(existsSync(join(acmeDir, "tenant.yaml"))).toBe(true);
    orgos(["validate"], "acme-init-test");
    rmSync(acmeDir, { recursive: true, force: true });
  }, 30_000);
});
