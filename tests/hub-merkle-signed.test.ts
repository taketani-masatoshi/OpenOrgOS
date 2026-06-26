import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../src/lib/utils.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { exportHubPublicKeyBase64 } from "../src/lib/hub/signing.js";
import {
  computeMerkleAnchorForDate,
  signMerkleAnchor,
  verifySignedMerkleAnchor,
  ensureSignedMerkleAnchor,
} from "../src/lib/hub/merkle-anchor.js";
import { appendJsonl } from "../src/lib/jsonl-store.js";
import { getHubReceiptsPath } from "../src/lib/hub/paths.js";
import { witnessReceiptSchema } from "../schemas/protocol/witness-receipt.js";
import { signWitnessReceipt, ensureHubSigningKey } from "../src/lib/hub/signing.js";

const HUB_DIR = join(ROOT_DIR, "scratch", "merkle-signed-test");

describe("signed merkle anchor", () => {
  beforeEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
    mkdirSync(HUB_DIR, { recursive: true });
    configureHubRuntime({ hubId: "HUB-T", dataDir: HUB_DIR });
    ensureHubSigningKey();
    const today = new Date().toISOString().slice(0, 10);
    const unsigned = {
      receipt_id: "WRCPT-S1",
      event_id: "f1e2f3a4-b5c6-4789-a012-3456789abcde",
      envelope_digest: "c".repeat(64),
      status: "mutually_confirmed" as const,
      attestations: [],
      issued_at: `${today}T12:00:00.000Z`,
      hub_id: "HUB-T",
    };
    const receipt = signWitnessReceipt(unsigned, ensureHubSigningKey());
    witnessReceiptSchema.parse(receipt);
    appendJsonl(getHubReceiptsPath(), receipt);
  });

  afterEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
  });

  it("signs and verifies merkle anchor", () => {
    const date = new Date().toISOString().slice(0, 10);
    const record = computeMerkleAnchorForDate(date);
    const signed = signMerkleAnchor(record);
    expect(signed.hub_signature).toBeTruthy();
    const pubKey = exportHubPublicKeyBase64();
    expect(verifySignedMerkleAnchor(signed, pubKey)).toBe(true);
  });

  it("ensureSignedMerkleAnchor persists signed anchor", () => {
    const date = new Date().toISOString().slice(0, 10);
    const anchor = ensureSignedMerkleAnchor(date);
    expect(anchor.hub_id).toBe("HUB-T");
    expect(anchor.hub_signature).toBeTruthy();
  });
});
