import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { runProdWireGate } from "../src/lib/protocol/prod-wire-gate.js";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
}

describe("prod-wire-gate", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "protocol", "wire-gateway.yaml"),
      `wire_version: "0.1"
node_id: demo
node_uri: steward://tenant/demo
display_name: Demo
listen:
  host: 127.0.0.1
  port: 8443
internal_api:
  base_url: http://127.0.0.1:8080/internal/v1/wire
  bearer_token: test
outbound:
  poll_interval_ms: 5000
audit:
  path: data/protocol/wire-gateway-audit.jsonl
legacy:
  enabled: false
`,
      "utf-8"
    );
  });

  afterEach(() => cleanup());

  it("reports wire gateway check for tenant config", () => {
    process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY = "1";
    const result = runProdWireGate({
      tenantId: "demo",
      strictTls: true,
      publicBaseUrl: "https://wire.demo.example",
    });
    expect(result.checks.some((c) => c.id === "wire_gateway")).toBe(true);
    const wire = result.checks.find((c) => c.id === "wire_gateway");
    expect(wire?.ok).toBe(true);
    delete process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY;
  });

  it("strict trust passes when registry keys are pinned", () => {
    const result = runProdWireGate({
      tenantId: "demo",
      strictTrust: true,
    });
    const trust = result.checks.find((c) => c.id === "trust_registry");
    expect(trust?.ok).toBe(true);
  });
});
