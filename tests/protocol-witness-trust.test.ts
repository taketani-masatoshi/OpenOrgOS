import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir } from "../src/lib/utils.js";
import { getWitnessTrustDir } from "../src/lib/protocol/paths.js";
import {
  initWitnessTrustAuthority,
  certifyWitnessHub,
  addCertificateToBundle,
  verifyWitnessTrustBundle,
  publishWitnessTrustBundle,
  loadWitnessTrustBundle,
} from "../src/lib/protocol/witness-trust.js";
import { generateHubKeyPair } from "../src/lib/hub/signing.js";

function cleanup(): void {
  const dir = join(getDataDir(), "protocol", "witness-trust");
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

describe("witness trust network (Org C PKI)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
  });

  afterEach(() => cleanup());

  it("certifies hub and verifies signed trust bundle", () => {
    initWitnessTrustAuthority({
      authorityId: "WTA-C-DEMO",
      orgName: "Neutral Witness Org C",
      jurisdiction: "JP",
      orgUri: "steward://tenant/trust-c",
    });

    const { publicKey } = generateHubKeyPair();
    const cert = certifyWitnessHub({
      hubId: "HUB-C",
      hubUrl: "http://127.0.0.1:9474",
      hubPublicKey: publicKey,
    });
    addCertificateToBundle(cert);
    const bundle = publishWitnessTrustBundle();
    const loaded = loadWitnessTrustBundle();
    expect(loaded?.certificates).toHaveLength(1);

    const result = verifyWitnessTrustBundle(bundle);
    expect(result.ok).toBe(true);
    expect(bundle.authority.authority_id).toBe("WTA-C-DEMO");
    expect(bundle.certificates[0]!.hub_id).toBe("HUB-C");
  });

  it("rejects tampered hub certificate", () => {
    initWitnessTrustAuthority({
      authorityId: "WTA-C-DEMO",
      orgName: "Neutral Witness Org C",
      jurisdiction: "JP",
    });
    const { publicKey } = generateHubKeyPair();
    const cert = certifyWitnessHub({
      hubId: "HUB-C",
      hubUrl: "http://127.0.0.1:9474",
      hubPublicKey: publicKey,
    });
    addCertificateToBundle(cert);
    const bundle = publishWitnessTrustBundle();
    bundle.certificates[0]!.hub_url = "http://evil.example/hub";
    const result = verifyWitnessTrustBundle(bundle);
    expect(result.ok).toBe(false);
  });
});
