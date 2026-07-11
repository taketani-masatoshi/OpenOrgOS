import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { runProdWireGate } from "../src/lib/protocol/prod-wire-gate.js";
import { getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("mal wire pilot gate", () => {
  const envKeys = [
    "WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY",
    "PUBLIC_BASE_URL",
    "ORGOS_STRICT_TRUST",
    "ORGOS_STRICT_TLS",
    "ORGOS_STRICT_TRANSPORT",
    "ORGOS_STRICT_TRUST_JURISDICTIONS",
    "GOV_GATEWAY_TRANSPORT",
  ] as const;
  const saved: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    setTenantId("mal");
    const mailConfig = getMailConfigPath();
    if (existsSync(mailConfig)) rmSync(mailConfig);
    for (const key of envKeys) {
      saved[key] = process.env[key];
    }
    process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY = "1";
    process.env.PUBLIC_BASE_URL = "https://wire.mal.example";
    process.env.ORGOS_STRICT_TRUST_JURISDICTIONS = "JP";
    process.env.GOV_GATEWAY_TRANSPORT = "mock";
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("reports unresolved production blockers in committed mal tenant config", () => {
    const result = runProdWireGate({
      tenantId: "mal",
      strictTrust: true,
      strictTls: true,
      strictTransport: true,
      publicBaseUrl: "https://wire.mal.example",
    });
    expect(result.ok).toBe(false);
    const failed = result.checks.filter((check) => !check.ok);
    expect(failed.map((check) => check.id)).toEqual(["email_wire"]);
    expect(failed[0]?.issues).toContain("mail-config.yaml not present");
  });
});
