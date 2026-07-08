import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { ORGOS_STATE_DIR, WIRE_CONSOLE_WEBAUTHN_SMOKE_FIXTURE } from "../../src/lib/wire-console/paths.js";

export { WIRE_CONSOLE_WEBAUTHN_SMOKE_FIXTURE };

export interface WireConsoleWebAuthnSmokeFixture {
  rp_id: string;
  credential_id: string;
  credential_id_base64: string;
  private_key_base64: string;
  operator_id: string;
  approver_id: string;
}

export function writeWireConsoleWebAuthnSmokeFixture(): WireConsoleWebAuthnSmokeFixture {
  const rpId = "localhost";
  const rawId = randomBytes(16);
  const credentialId = rawId.toString("base64url");
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeySpki = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  const fixture: WireConsoleWebAuthnSmokeFixture = {
    rp_id: rpId,
    credential_id: credentialId,
    credential_id_base64: rawId.toString("base64"),
    private_key_base64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    operator_id: "E2E WebAuthn",
    approver_id: "テスト承認者",
  };

  mkdirSync(ORGOS_STATE_DIR, { recursive: true });
  writeFileSync(WIRE_CONSOLE_WEBAUTHN_SMOKE_FIXTURE, JSON.stringify(fixture, null, 2), "utf-8");

  process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS = JSON.stringify([
    {
      credential_id: fixture.credential_id,
      public_key_spki_base64: publicKeySpki.toString("base64"),
      operator_id: fixture.operator_id,
      approver_id: fixture.approver_id,
    },
  ]);

  return fixture;
}
