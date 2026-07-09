import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir } from "../src/lib/utils.js";
import { runWireGatewayInit } from "../src/commands/wire-gateway.js";
import { loadWireGatewayConfig } from "../src/lib/wire-gateway/validate.js";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
}

describe("wire-gateway init", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
  });

  afterEach(() => cleanup());

  it("writes tenant wire-gateway.yaml from trust registry", () => {
    runWireGatewayInit({ tenant: "demo" });
    const config = loadWireGatewayConfig();
    expect(config?.node_id).toBe("org.example.co.jp");
    expect(config?.node_uri).toBe("steward://tenant/demo");
    expect(config?.legacy?.enabled).toBe(false);
    expect(config?.internal_api.bearer_token).toContain("demo");
  });

  it("refuses overwrite without --force", () => {
    runWireGatewayInit({ tenant: "demo" });
    expect(() => runWireGatewayInit({ tenant: "demo" })).toThrow(/already exists/);
  });
});
