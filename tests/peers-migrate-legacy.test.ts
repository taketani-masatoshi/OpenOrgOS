import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { registerPeer, loadPeersRegistry } from "../src/lib/protocol/peers.js";
import { migrateLegacyWebhookPeers } from "../src/lib/protocol/peers-migrate-legacy.js";
import { validateProtocolState } from "../src/lib/protocol/validate.js";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) {
    rmSync(protocolDir, { recursive: true, force: true });
  }
}

describe("peers migrate-legacy", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    delete process.env.ORGOS_STRICT_TRANSPORT;
  });

  afterEach(() => {
    cleanup();
    delete process.env.ORGOS_STRICT_TRANSPORT;
  });

  it("dry-run reports migration without writing", () => {
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Partner",
      jurisdiction: "JP",
      inbound_webhook_url: "http://127.0.0.1:9999/steward/webhook",
    });
    const { results, apply } = migrateLegacyWebhookPeers({ apply: false });
    expect(apply).toBe(false);
    expect(results[0]!.status).toBe("migrated");
    const peer = loadPeersRegistry().peers[0]!;
    expect(peer.inbound_webhook_url).toBeDefined();
    expect(peer.inbound_endpoints).toBeUndefined();
  });

  it("apply writes wire_v1 when --to-wire-url set", () => {
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Partner",
      jurisdiction: "JP",
      inbound_webhook_url: "http://127.0.0.1:9999/steward/webhook",
    });
    migrateLegacyWebhookPeers({
      apply: true,
      toWireUrl: "https://wire.example/wire/v1/events",
    });
    const peer = loadPeersRegistry().peers[0]!;
    expect(peer.inbound_webhook_url).toBeUndefined();
    expect(peer.inbound_endpoints?.[0]?.transport).toBe("wire_v1");
  });

  it("ORGOS_STRICT_TRANSPORT fails on legacy peers", () => {
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Partner",
      jurisdiction: "JP",
      inbound_webhook_url: "http://127.0.0.1:9999/steward/webhook",
    });
    process.env.ORGOS_STRICT_TRANSPORT = "1";
    const result = validateProtocolState({ standalone: true });
    expect(result.issues.some((i) => i.code === "legacy-webhook-transport")).toBe(true);
  });
});
