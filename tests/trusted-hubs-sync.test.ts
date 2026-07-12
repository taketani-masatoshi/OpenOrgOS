import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startHubServer } from "../src/lib/hub-server.js";
import {
  fetchHubPublicKey,
  syncTrustedHubPublicKeys,
} from "../src/lib/protocol/trusted-hubs-sync.js";
import { ROOT_DIR } from "../src/lib/utils.js";

const SCRATCH = join(ROOT_DIR, "scratch", "trusted-hubs-sync");
const REGISTRY = join(SCRATCH, "trusted-hubs.yaml");

describe("trusted-hubs sync-keys", () => {
  beforeEach(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
    mkdirSync(SCRATCH, { recursive: true });
  });

  afterEach(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
  });

  it("fetchHubPublicKey from running hub", async () => {
    const hubDir = join(SCRATCH, "hub-a");
    mkdirSync(hubDir, { recursive: true });
    const server = await startHubServer({
      hubId: "HUB-A",
      dataDir: hubDir,
      host: "127.0.0.1",
      port: 0,
    });
    try {
      const key = await fetchHubPublicKey(server.url);
      expect(key.hub_id).toBe("HUB-A");
      expect(key.public_key.length).toBeGreaterThan(20);
    } finally {
      server.close();
    }
  });

  it("syncTrustedHubPublicKeys updates empty hub_public_key", async () => {
    const hubDir = join(SCRATCH, "hub-b");
    mkdirSync(hubDir, { recursive: true });
    const server = await startHubServer({
      hubId: "HUB-B",
      dataDir: hubDir,
      host: "127.0.0.1",
      port: 0,
    });

    writeFileSync(
      REGISTRY,
      `version: "1"
jurisdictions:
  - jurisdiction: TEST
    hubs:
      - hub_id: HUB-B
        hub_url: ${server.url}
        hub_public_key: ""
        priority: 1
`,
      "utf-8"
    );

    try {
      const { results } = await syncTrustedHubPublicKeys({
        registryPath: REGISTRY,
        jurisdiction: "TEST",
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("updated");
      const yaml = readFileSync(REGISTRY, "utf-8");
      expect(yaml).toContain("hub_public_key:");
      expect(yaml).not.toMatch(/hub_public_key:\s*""/);
    } finally {
      server.close();
    }
  });
});
