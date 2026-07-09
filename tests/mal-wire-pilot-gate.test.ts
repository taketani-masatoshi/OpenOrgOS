import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runProdWireGate } from "../src/lib/protocol/prod-wire-gate.js";
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

  it("passes production wire gate with committed mal tenant config", () => {
    const result = runProdWireGate({
      tenantId: "mal",
      strictTrust: true,
      strictTls: true,
      strictTransport: true,
      publicBaseUrl: "https://wire.mal.example",
    });
    expect(result.ok).toBe(true);
    for (const check of result.checks) {
      expect(check.ok, `${check.id}: ${check.issues?.join("; ")}`).toBe(true);
    }
  });
});
