import { describe, expect, it } from "vitest";
import { webauthnOriginsEqual } from "../src/lib/wire-console/auth/webauthn-origin.js";
import { verifyWebAuthnAssertion } from "../src/lib/wire-console/auth/webauthn-assertion.js";
import {
  buildTestAuthenticatorData,
  mintTestWebAuthnAssertion,
} from "../src/lib/wire-console/auth/webauthn-verify.js";
import { WebAuthnCredentialStoreCorruptError } from "../src/lib/wire-console/auth/webauthn-store.js";

describe("webauthnOriginsEqual", () => {
  it("treats 127.0.0.1 and localhost as the same loopback origin when port matches", () => {
    expect(
      webauthnOriginsEqual("http://localhost:9470", "http://127.0.0.1:9470"),
    ).toBe(true);
    expect(
      webauthnOriginsEqual("http://127.0.0.1:9470", "http://localhost:9470"),
    ).toBe(true);
  });

  it("rejects a different port", () => {
    expect(
      webauthnOriginsEqual("http://localhost:9471", "http://127.0.0.1:9470"),
    ).toBe(false);
  });

  it("rejects missing actual or expected origin (fail closed)", () => {
    expect(webauthnOriginsEqual(undefined, "https://chat.example")).toBe(false);
    expect(webauthnOriginsEqual("https://chat.example", undefined)).toBe(false);
    expect(webauthnOriginsEqual("", "https://chat.example")).toBe(false);
  });
});

describe("verifyWebAuthnAssertion", () => {
  it("accepts a minted assertion with UP|UV and matching rpId hash", () => {
    const assertion = mintTestWebAuthnAssertion({
      rpId: "localhost",
      challenge: "chal",
      credentialId: "cred-1",
      origin: "http://localhost:9470",
    });
    const result = verifyWebAuthnAssertion({
      expectedRpId: "localhost",
      expectedOrigin: "http://localhost:9470",
      clientDataJsonBase64: assertion.client_data_json,
      authenticatorDataBase64: assertion.authenticator_data_base64,
      signatureBase64: assertion.signature_base64,
      publicKeySpkiBase64: assertion.public_key_spki_base64,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing expected origin", () => {
    const assertion = mintTestWebAuthnAssertion({
      rpId: "localhost",
      challenge: "chal",
      credentialId: "cred-1",
      origin: "http://localhost:9470",
    });
    const result = verifyWebAuthnAssertion({
      expectedRpId: "localhost",
      expectedOrigin: "",
      clientDataJsonBase64: assertion.client_data_json,
      authenticatorDataBase64: assertion.authenticator_data_base64,
      signatureBase64: assertion.signature_base64,
      publicKeySpkiBase64: assertion.public_key_spki_base64,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/origin/i);
  });

  it("rejects UP-only authenticatorData after signature path fails or UV missing", () => {
    const assertion = mintTestWebAuthnAssertion({
      rpId: "localhost",
      challenge: "chal",
      credentialId: "cred-1",
      origin: "http://localhost:9470",
    });
    const upOnly = buildTestAuthenticatorData("localhost");
    upOnly[32] = 0x01;
    const result = verifyWebAuthnAssertion({
      expectedRpId: "localhost",
      expectedOrigin: "http://localhost:9470",
      clientDataJsonBase64: assertion.client_data_json,
      authenticatorDataBase64: upOnly.toString("base64url"),
      signatureBase64: assertion.signature_base64,
      publicKeySpkiBase64: assertion.public_key_spki_base64,
    });
    expect(result.ok).toBe(false);
  });
});

describe("WebAuthnCredentialStoreCorruptError", () => {
  it("is a distinct fail-closed error type", () => {
    const err = new WebAuthnCredentialStoreCorruptError();
    expect(err.name).toBe("WebAuthnCredentialStoreCorruptError");
  });
});
