import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "../src/lib/protocol/signing.js";
import { getDataDir, ROOT_DIR, readYamlFile } from "../src/lib/utils.js";
import {
  pinLocalWireTrustRegistryKeys,
  syncWireTrustRegistryPublicKeys,
} from "../src/lib/protocol/wire-trust-registry-sync.js";
import { validateWireTrustRegistry } from "../src/lib/protocol/wire-trust-registry.js";
import { wireTrustRegistrySchema } from "../schemas/protocol/wire-trust-registry.js";

const SCRATCH = join(ROOT_DIR, "scratch", "wire-trust-registry-sync");
const REGISTRY = join(SCRATCH, "wire-trust-registry.yaml");

function writeRegistry(body: string): void {
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(REGISTRY, body, "utf-8");
}

describe("wire-trust-registry sync / pin-local", () => {
  beforeEach(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
    mkdirSync(SCRATCH, { recursive: true });
    setTenantId("demo");
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    ensureProtocolSigningKey();
    delete process.env.ORGOS_STRICT_TRUST;
  });

  afterEach(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
    delete process.env.ORGOS_STRICT_TRUST;
  });

  it("syncWireTrustRegistryPublicKeys patches from well-known", async () => {
    const publicKey = exportProtocolPublicKeyBase64()!;
    writeRegistry(`version: "1"
nodes:
  - node_id: org.example.co.jp
    tenant_id: demo
    did: did:ooo:org:demo
    protocol_public_key: ""
    wire_url: http://127.0.0.1:0
`);

    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          node_id: "org.example.co.jp",
          protocol_public_key: publicKey,
          wire_version: "0.1",
          did: "did:ooo:org:demo",
          endpoints: {
            events_push: "http://127.0.0.1/wire/v1/events",
            events_pull: "http://127.0.0.1/wire/v1/events",
            health: "http://127.0.0.1/wire/v1/health",
          },
        })
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const wireUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const { results } = await syncWireTrustRegistryPublicKeys({
        registryPath: REGISTRY,
        wireUrl,
        force: true,
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("updated");
      const yaml = readFileSync(REGISTRY, "utf-8");
      expect(yaml).toContain(publicKey);
    } finally {
      server.close();
    }
  });

  it("pinLocalWireTrustRegistryKeys updates empty key", () => {
    writeRegistry(`version: "1"
nodes:
  - node_id: org.example.co.jp
    tenant_id: demo
    did: did:ooo:org:demo
    node_uri: steward://tenant/demo
    protocol_public_key: ""
`);
    const { results } = pinLocalWireTrustRegistryKeys({
      tenant: "demo",
      registryPath: REGISTRY,
      force: true,
    });
    expect(results[0]!.status).toBe("updated");
    const yaml = readFileSync(REGISTRY, "utf-8");
    expect(yaml).not.toMatch(/protocol_public_key:\s*""/);
  });

  it("ORGOS_STRICT_TRUST makes empty keys errors", () => {
    writeRegistry(`version: "1"
nodes:
  - node_id: org.example.co.jp
    tenant_id: demo
    protocol_public_key: ""
`);
    process.env.ORGOS_STRICT_TRUST = "1";
    const reg = readYamlFile(REGISTRY, wireTrustRegistrySchema);
    const result = validateWireTrustRegistry(reg);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "missing-public-key")).toBe(true);
  });
});
