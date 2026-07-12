import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { WIRE_CONSOLE_WEBAUTHN_SMOKE_FIXTURE } from "../paths.js";
import { mintTestWebAuthnAssertion } from "./webauthn-verify.js";
import { verifyWebAuthnLogin } from "./webauthn.js";

export function isWebAuthnE2eLoginEnabled(): boolean {
  return process.env.WIRE_CONSOLE_E2E_WEBAUTHN === "1";
}

interface WebAuthnSmokeFixture {
  rp_id: string;
  credential_id: string;
  private_key_base64: string;
  operator_id: string;
  approver_id: string;
}

export function completeWebAuthnE2eLogin(challenge: string) {
  if (!isWebAuthnE2eLoginEnabled()) {
    return { error: "webauthn e2e login disabled" as const };
  }
  let fixture: WebAuthnSmokeFixture;
  try {
    fixture = JSON.parse(
      readFileSync(WIRE_CONSOLE_WEBAUTHN_SMOKE_FIXTURE, "utf-8")
    ) as WebAuthnSmokeFixture;
  } catch {
    return { error: "webauthn e2e fixture missing" as const };
  }

  const privateKey = createPrivateKey({
    key: Buffer.from(fixture.private_key_base64, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const port = process.env.WIRE_CONSOLE_WEBAUTHN_SMOKE_PORT ?? "9473";
  const origin = process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN ?? `http://localhost:${port}`;

  const assertion = mintTestWebAuthnAssertion({
    rpId: fixture.rp_id,
    challenge,
    credentialId: fixture.credential_id,
    origin,
    privateKey,
  });

  return verifyWebAuthnLogin({
    credential_id: assertion.credential_id,
    challenge,
    client_data_json: assertion.client_data_json,
    authenticator_data_base64: assertion.authenticator_data_base64,
    signature_base64: assertion.signature_base64,
  });
}
