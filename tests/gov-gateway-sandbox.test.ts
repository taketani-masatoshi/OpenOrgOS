import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, ROOT_DIR } from "../src/lib/utils.js";
import {
  pingSandboxEndpoint,
  resolveSandboxUrl,
  govGatewaySandboxHealth,
} from "../src/lib/wire/gov-gateway/sandbox.js";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
}

describe("gov-gateway sandbox", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
  });

  afterEach(() => {
    cleanup();
    delete process.env.GOV_XROAD_SECURITY_SERVER_URL;
  });

  it("resolveSandboxUrl prefers env over placeholder binding", () => {
    process.env.GOV_XROAD_SECURITY_SERVER_URL = "https://ss.real.example.ee";
    const url = resolveSandboxUrl("xroad_v7", {
      profile_id: "xroad_v7",
      adapter_ref: "x",
      security_server_url: "https://ss-sandbox.example.ee",
    });
    expect(url).toBe("https://ss.real.example.ee");
  });

  it("pingSandboxEndpoint reaches HTTP server", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const url = `http://127.0.0.1:${addr.port}`;
    try {
      const ping = await pingSandboxEndpoint(url);
      expect(ping.ok).toBe(true);
      expect(ping.httpStatus).toBe(200);
    } finally {
      server.close();
    }
  });

  it("govGatewaySandboxHealth --live fails without sandbox URL", async () => {
    writeFileSync(
      join(getDataDir(), "protocol", "gov-gateway.yaml"),
      `enabled: true
default_profile: xroad_v7
profiles:
  - profile_id: xroad_v7
    enabled: true
    adapter_ref: steward/jurisdiction-packs/EE/protocol/xroad-adapter.profile.yaml
    security_server_url: https://ss-sandbox.example.ee
`,
      "utf-8"
    );
    const health = await govGatewaySandboxHealth("xroad_v7", { live: true });
    expect(health.live).toBe(true);
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("no sandbox URL");
  });
});
