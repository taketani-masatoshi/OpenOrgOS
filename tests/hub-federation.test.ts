import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../src/lib/utils.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { loadHubFederation, addFederationPeer } from "../src/lib/hub/federation.js";

const HUB_DIR = join(ROOT_DIR, "scratch", "federation-test");

describe("hub federation", () => {
  beforeEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
    mkdirSync(HUB_DIR, { recursive: true });
    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_DIR });
  });

  afterEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
  });

  it("addFederationPeer persists peer", () => {
    addFederationPeer({
      hub_id: "HUB-B",
      hub_url: "http://127.0.0.1:9475",
      hub_public_key: "testkey",
      priority: 1,
    });
    const federation = loadHubFederation();
    expect(federation.hub_peers).toHaveLength(1);
    expect(federation.hub_peers[0]!.hub_id).toBe("HUB-B");
  });
});
