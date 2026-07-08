import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  ORGOS_CLI_INVOCATION,
  ORGOS_CLI_NAME,
  ORGOS_PACKAGE_NAME,
  ORGOS_TENANT_ENV,
  LEGACY_TENANT_ENV,
} from "../src/lib/orgos-cli.js";

const root = join(import.meta.dirname, "..");

describe("OrgOS CLI branding", () => {
  it("exports product constants", () => {
    expect(ORGOS_PACKAGE_NAME).toBe("orgos-reference");
    expect(ORGOS_CLI_NAME).toBe("orgos");
    expect(ORGOS_CLI_INVOCATION).toBe("npm run orgos --");
  });

  it("orgos npm script runs validate help", () => {
    const out = execFileSync("npm", ["run", "orgos", "--", "validate", "--help"], {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, ORGOS_SUPPRESS_LEGACY_WARN: "1" },
    });
    expect(out).toContain("validate");
  });

  it("legacy steward npm script still works with deprecation warning", () => {
    const result = spawnSync("npm", ["run", "steward", "--", "validate", "--help"], {
      cwd: root,
      encoding: "utf-8",
      env: process.env,
    });
    const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(result.status).toBe(0);
    expect(combined).toContain("validate");
    expect(combined).toMatch(/deprecated|orgos/i);
  });

  it("ORGOS_TENANT takes precedence over STEWARD_TENANT", async () => {
    const { resolveTenantFromEnv, setTenantEnv } = await import("../src/lib/orgos-cli.js");
    const prevOrg = process.env[ORGOS_TENANT_ENV];
    const prevLegacy = process.env[LEGACY_TENANT_ENV];
    try {
      process.env[ORGOS_TENANT_ENV] = "acme";
      process.env[LEGACY_TENANT_ENV] = "demo";
      expect(resolveTenantFromEnv()).toBe("acme");
      setTenantEnv("mal");
      expect(process.env[ORGOS_TENANT_ENV]).toBe("mal");
      expect(process.env[LEGACY_TENANT_ENV]).toBe("mal");
    } finally {
      if (prevOrg === undefined) delete process.env[ORGOS_TENANT_ENV];
      else process.env[ORGOS_TENANT_ENV] = prevOrg;
      if (prevLegacy === undefined) delete process.env[LEGACY_TENANT_ENV];
      else process.env[LEGACY_TENANT_ENV] = prevLegacy;
    }
  });
});
