import { describe, expect, it } from "vitest";
import {
  mintTestWebAuthnAssertion,
  verifyWebAuthnAssertionSignature,
} from "../src/lib/wire-console/auth/webauthn-verify.js";

describe("webauthn assertion verification", () => {
  it("verifies ES256 assertion over authData || clientDataHash", () => {
    const challenge = "dGVzdC1jaGFsbGVuZ2U";
    const assertion = mintTestWebAuthnAssertion({
      rpId: "127.0.0.1",
      challenge,
      credentialId: "unit-cred",
    });
    expect(
      verifyWebAuthnAssertionSignature({
        publicKeySpkiBase64: assertion.public_key_spki_base64,
        authenticatorDataBase64: assertion.authenticator_data_base64,
        clientDataJsonBase64: assertion.client_data_json,
        signatureBase64: assertion.signature_base64,
      })
    ).toBe(true);
  });

  it("rejects tampered signatures", () => {
    const assertion = mintTestWebAuthnAssertion({
      rpId: "127.0.0.1",
      challenge: "bad-challenge-bytes",
      credentialId: "unit-cred",
    });
    expect(
      verifyWebAuthnAssertionSignature({
        publicKeySpkiBase64: assertion.public_key_spki_base64,
        authenticatorDataBase64: assertion.authenticator_data_base64,
        clientDataJsonBase64: assertion.client_data_json,
        signatureBase64: "AAAA",
      })
    ).toBe(false);
  });
});
