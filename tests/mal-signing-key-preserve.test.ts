import { describe, expect, it, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, ROOT_DIR } from "../src/lib/tenant.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
} from "../src/lib/protocol/signing.js";
import { deriveOpenOrgDidFromPublicKey } from "../schemas/protocol/openorg-did.js";
import { syncWireGatewayDidFromSigningKey } from "../src/lib/protocol/wire-gateway-did-sync.js";

/**
 * F2/F3 — operational mal signing key must survive fixture restore and stay
 * aligned with wire-gateway.yaml did.
 */
describe("mal signing-key preserve + gateway DID sync", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("keeps signing-key.pem after setup restore and pins gateway did", () => {
    const keyPath = join(ROOT_DIR, "tenants/mal/data/protocol/signing-key.pem");
    ensureProtocolSigningKey();
    expect(existsSync(keyPath)).toBe(true);

    const before = readFileSync(keyPath, "utf-8");
    const publicKey = exportProtocolPublicKeyBase64();
    expect(publicKey).toBeTruthy();
    const expectedDid = deriveOpenOrgDidFromPublicKey(publicKey!);

    const sync = syncWireGatewayDidFromSigningKey();
    expect(sync.did).toBe(expectedDid);

    const gateway = readFileSync(
      join(ROOT_DIR, "tenants/mal/data/protocol/wire-gateway.yaml"),
      "utf-8"
    );
    expect(gateway).toContain(`did: ${expectedDid}`);
    expect(readFileSync(keyPath, "utf-8")).toBe(before);
  });
});
