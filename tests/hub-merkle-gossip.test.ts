import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../src/lib/utils.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { startHubServer } from "../src/lib/hub-server.js";
import { exportHubPublicKeyBase64 } from "../src/lib/hub/signing.js";
import { appendJsonl } from "../src/lib/jsonl-store.js";
import { getHubReceiptsPath } from "../src/lib/hub/paths.js";
import { witnessReceiptSchema } from "../schemas/protocol/witness-receipt.js";
import { computeMerkleAnchorForDate, saveMerkleAnchor } from "../src/lib/hub/merkle-anchor.js";
import { exportGossipSnapshot } from "../src/lib/hub/gossip.js";

const HUB_DIR = join(ROOT_DIR, "scratch", "hub-merkle-test");

describe("hub merkle anchor and gossip", () => {
  let server: { url: string; close: () => void };

  beforeEach(async () => {
    rmSync(HUB_DIR, { recursive: true, force: true });
    mkdirSync(HUB_DIR, { recursive: true });
    configureHubRuntime({ hubId: "HUB-T", dataDir: HUB_DIR });
    const today = new Date().toISOString().slice(0, 10);
    const receipt = witnessReceiptSchema.parse({
      receipt_id: "WRCPT-M1",
      event_id: "c1b2c3d4-e5f6-4789-a012-3456789abcde",
      envelope_digest: "c".repeat(64),
      status: "mutually_confirmed",
      attestations: [],
      issued_at: `${today}T12:00:00.000Z`,
      hub_id: "HUB-T",
      hub_signature: "placeholder",
    });
    appendJsonl(getHubReceiptsPath(), receipt);
    server = await startHubServer({ hubId: "HUB-T", dataDir: HUB_DIR, host: "127.0.0.1", port: 0 });
  });

  afterEach(() => {
    server.close();
    rmSync(HUB_DIR, { recursive: true, force: true });
  });

  it("computes merkle anchor for date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const anchor = computeMerkleAnchorForDate(today);
    expect(anchor.receipt_count).toBe(1);
    expect(anchor.merkle_root).toMatch(/^[a-f0-9]{64}$/);
    saveMerkleAnchor(anchor);
  });

  it("exports gossip snapshot", () => {
    const snap = exportGossipSnapshot();
    expect(snap.receipt_count).toBe(1);
  });

  it("fetches GET /hub/v1/anchor with signature", async () => {
    const res = await fetch(`${server.url}/hub/v1/anchor`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { anchor?: { merkle_root: string; hub_signature?: string } };
    expect(body.anchor?.merkle_root).toBeTruthy();
    expect(body.anchor?.hub_signature).toBeTruthy();
  });
});
