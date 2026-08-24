import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { ORGOS_STATE_DIR, WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH, WIRE_CONSOLE_WEBAUTHN_SMOKE_FIXTURE } from "../../src/lib/wire-console/paths.js";
import { mintPasskeyBootstrapToken, resetPasskeyBootstrapStoreForTests } from "../../src/lib/wire-console/auth/passkey-bootstrap.js";
import { resetEnvManagedSignCountsForTests } from "../../src/lib/wire-console/auth/webauthn-env-sign-count.js";
import { resetWebAuthnCredentialsForTests } from "../../src/lib/wire-console/auth/webauthn-store.js";

export { WIRE_CONSOLE_WEBAUTHN_SMOKE_FIXTURE };

export interface WireConsoleWebAuthnSmokeFixture {
  rp_id: string;
  credential_id: string;
  credential_id_base64: string;
  private_key_base64: string;
  operator_id: string;
  approver_id: string;
  bootstrap_token?: string;
  settlement_credential_id?: string;
  settlement_credential_id_base64?: string;
  settlement_private_key_base64?: string;
}

export function writeWireConsoleWebAuthnBootstrapSmokeFixture(): WireConsoleWebAuthnSmokeFixture {
  resetPasskeyBootstrapStoreForTests();
  resetWebAuthnCredentialsForTests();
  try {
    unlinkSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH);
  } catch {
    /* fresh bootstrap run */
  }
  const { token } = mintPasskeyBootstrapToken({ operatorId: "OP-001", ttl: "1h" });
  const fixture: WireConsoleWebAuthnSmokeFixture = {
    rp_id: "localhost",
    credential_id: "",
    credential_id_base64: "",
    private_key_base64: "",
    operator_id: "OP-001",
    approver_id: "Demo CEO",
    bootstrap_token: token,
  };
  mkdirSync(ORGOS_STATE_DIR, { recursive: true });
  writeFileSync(WIRE_CONSOLE_WEBAUTHN_SMOKE_FIXTURE, JSON.stringify(fixture, null, 2), "utf-8");
  delete process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS;
  return fixture;
}

export function writeWireConsoleWebAuthnSmokeFixture(): WireConsoleWebAuthnSmokeFixture {
  resetWebAuthnCredentialsForTests();
  resetEnvManagedSignCountsForTests();
  try {
    unlinkSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH);
  } catch {
    /* fresh smoke run */
  }
  try {
    unlinkSync(join(ORGOS_STATE_DIR, "webauthn-sign-counts.json"));
  } catch {
    /* fresh smoke run */
  }
  const rpId = "localhost";
  const rawId = randomBytes(16);
  const credentialId = rawId.toString("base64url");
  const settlementRawId = randomBytes(16);
  const settlementCredentialId = settlementRawId.toString("base64url");
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const { privateKey: settlementPrivateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeySpki = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  const settlementPublicKeySpki = createPublicKey(settlementPrivateKey).export({
    type: "spki",
    format: "der",
  });
  const fixture: WireConsoleWebAuthnSmokeFixture = {
    rp_id: rpId,
    credential_id: credentialId,
    credential_id_base64: rawId.toString("base64"),
    private_key_base64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    operator_id: "OP-001",
    approver_id: "段燕燕",
    settlement_credential_id: settlementCredentialId,
    settlement_credential_id_base64: settlementRawId.toString("base64"),
    settlement_private_key_base64: settlementPrivateKey
      .export({ type: "pkcs8", format: "der" })
      .toString("base64"),
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
    {
      credential_id: fixture.settlement_credential_id,
      public_key_spki_base64: settlementPublicKeySpki.toString("base64"),
      operator_id: fixture.operator_id,
      approver_id: fixture.approver_id,
      purpose: "settlement",
      authenticator_attachment: "cross-platform",
    },
  ]);

  return fixture;
}
