import { describe, expect, it, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, ROOT_DIR } from "../src/lib/tenant.js";
import {
  ensureEmailWireLoopbackPeer,
  ensureMailConfigFromExample,
  ensureMalMailConfigExampleFiles,
  runWirePilotHygiene,
  EMAIL_WIRE_LOOPBACK_PEER_ID,
} from "../src/lib/protocol/wire-pilot-hygiene.js";
import { findPeer } from "../src/lib/protocol/peers.js";
import { exportProtocolPublicKeyBase64 } from "../src/lib/protocol/signing.js";
import { deriveOpenOrgDidFromPublicKey } from "../schemas/protocol/openorg-did.js";

describe("wire-pilot-hygiene", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("aligns gateway DID, meta, and PEER-003 to the current signing key", () => {
    const result = runWirePilotHygiene("mal");
    expect(result.tenant).toBe("mal");
    expect(result.public_key.length).toBeGreaterThan(20);
    expect(result.gateway_did).toBe(deriveOpenOrgDidFromPublicKey(result.public_key));
    expect(result.gateway_did).toMatch(/^did:ooo:org:pk-[0-9a-f]{16}$/);

    const peer = findPeer(EMAIL_WIRE_LOOPBACK_PEER_ID);
    expect(peer).toBeTruthy();
    expect(peer!.protocol_public_key).toBe(result.public_key);
    expect(peer!.did).toBe(result.gateway_did);
    expect(peer!.org_uri).toBe("steward://tenant/mal");
    expect(exportProtocolPublicKeyBase64()).toBe(result.public_key);
    expect(["aligned", "updated", "skipped"]).toContain(result.trust_registry);
  });

  it("keeps deploy example mirrored into tenant records", () => {
    const deploy = join(ROOT_DIR, "deploy/mal-pilot/mail-config.mal-pilot.yaml.example");
    expect(existsSync(deploy)).toBe(true);
    const mirrored = ensureMalMailConfigExampleFiles();
    expect(existsSync(mirrored.deploy)).toBe(true);
    expect(existsSync(mirrored.tenantExample)).toBe(true);
  });

  it("restores mail-config from deploy example when missing", () => {
    const cfg = join(ROOT_DIR, "tenants/mal/records/executive/mail-config.yaml");
    // Hygiene must be able to restore; if Zone C blocks, skip gracefully.
    ensureMalMailConfigExampleFiles();
    const mail = ensureMailConfigFromExample("mal");
    if (mail.status === "missing_example") {
      expect(existsSync(join(ROOT_DIR, "deploy/mal-pilot/mail-config.mal-pilot.yaml.example"))).toBe(
        false
      );
      return;
    }
    expect(["present", "restored"]).toContain(mail.status);
    expect(existsSync(cfg)).toBe(true);
  });

  it("ensureEmailWireLoopbackPeer is idempotent", () => {
    expect(ensureEmailWireLoopbackPeer({ tenantId: "mal" })).toMatch(/present|updated|registered/);
    expect(ensureEmailWireLoopbackPeer({ tenantId: "mal" })).toBe("present");
  });
});
