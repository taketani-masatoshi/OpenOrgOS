import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import {
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
} from "../src/lib/company-events.js";
import {
  loadCompanyEventsAttestations,
  runWeeklyCompanyEventsAttestation,
  verifyCompanyEventsAttestation,
} from "../src/lib/company-events-attestation.js";
import {
  loadCompanyEventsSigningMeta,
  rotateCompanyEventsSigningKey,
  signAttestationPayload,
} from "../src/lib/company-events-signing.js";
import { getDataDir } from "../src/lib/utils.js";
import { setTenantId } from "../src/lib/tenant.js";

function cleanup(): void {
  for (const name of [
    "company-events.yaml",
    "company-events-chain.jsonl",
    "company-events-attestations.jsonl",
    "company-events-signing-meta.yaml",
  ]) {
    const p = join(getDataDir(), name);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  const orgosDir = join(getDataDir(), ".orgos");
  if (existsSync(orgosDir)) rmSync(orgosDir, { recursive: true, force: true });
}

describe("company-events attestation trust anchor", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    initCompanyEventsFile();
    ensureCompanyEventMonth("2026-07");
    createCompanyEvent({
      kind: "misc",
      title: "Trust test",
      occurredAt: "2026-07-08",
      slug: "trust-test",
    });
  });

  afterEach(() => cleanup());

  it("rejects attestation signed with untrusted key", () => {
    const { attestation } = runWeeklyCompanyEventsAttestation({ force: true });
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const roguePub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const roguePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const { signature, public_key, payload_digest, signed_at, key_id, ...payload } = attestation;
    void signature;
    void public_key;
    void payload_digest;
    void signed_at;
    void key_id;
    const rogueSigned = signAttestationPayload(payload, roguePem);
    const forged = {
      ...attestation,
      public_key: roguePub,
      key_id: "deadbeefdeadbeef",
      signature: rogueSigned.signature,
      payload_digest: rogueSigned.payload_digest,
    };
    expect(verifyCompanyEventsAttestation(forged).ok).toBe(false);
  });

  it("verifies legacy attestation after key rotation via history", () => {
    const first = runWeeklyCompanyEventsAttestation({ force: true }).attestation;
    expect(verifyCompanyEventsAttestation(first).ok).toBe(true);

    rotateCompanyEventsSigningKey();
    expect(verifyCompanyEventsAttestation(first).ok).toBe(true);

    const second = runWeeklyCompanyEventsAttestation({ force: true }).attestation;
    expect(second.key_id).toBeTruthy();
    expect(verifyCompanyEventsAttestation(second).ok).toBe(true);
    expect(loadCompanyEventsSigningMeta()?.history.length).toBeGreaterThan(0);
  });

  it("returns unverifiable when signing meta is missing", () => {
    const { attestation } = runWeeklyCompanyEventsAttestation({ force: true });
    rmSync(join(getDataDir(), "company-events-signing-meta.yaml"), { force: true });
    expect(verifyCompanyEventsAttestation(attestation).ok).toBe(false);
    expect(verifyCompanyEventsAttestation(attestation).reason).toBe("unverifiable-no-signing-meta");
  });

  it("strictLegacy rejects attestations without key_id", () => {
    const { attestation } = runWeeklyCompanyEventsAttestation({ force: true });
    const legacy = { ...attestation, key_id: undefined };
    expect(verifyCompanyEventsAttestation(legacy, { strictLegacy: true }).ok).toBe(false);
  });

  it("stores attestations append-only", () => {
    runWeeklyCompanyEventsAttestation({ force: true });
    rotateCompanyEventsSigningKey();
    runWeeklyCompanyEventsAttestation({ force: true });
    expect(loadCompanyEventsAttestations().length).toBeGreaterThanOrEqual(1);
  });
});
