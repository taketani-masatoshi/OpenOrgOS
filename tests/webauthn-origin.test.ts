import { describe, expect, it } from "vitest";
import {
  resolveExpectedWebAuthnOrigin,
  webauthnOriginsEqual,
} from "../src/lib/wire-console/auth/webauthn-origin.js";
import {
  authenticateWireConsoleLogin,
  getWireConsoleAuthConfigResponse,
} from "../src/lib/wire-console/auth/login.js";
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

  it("uses the loopback client origin in non-prod when env is unset", () => {
    const prev = process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
    const prevAuth = process.env.WIRE_CONSOLE_AUTH;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
    delete process.env.WIRE_CONSOLE_AUTH;
    expect(resolveExpectedWebAuthnOrigin("http://localhost:9484")).toBe(
      "http://localhost:9484",
    );
    expect(resolveExpectedWebAuthnOrigin("http://127.0.0.1:9484")).toBe(
      "http://127.0.0.1:9484",
    );
    expect(resolveExpectedWebAuthnOrigin("https://evil.example")).toBeUndefined();
    if (prev === undefined) delete process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
    else process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = prev;
    if (prevAuth === undefined) delete process.env.WIRE_CONSOLE_AUTH;
    else process.env.WIRE_CONSOLE_AUTH = prevAuth;
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

describe("getWireConsoleAuthConfigResponse", () => {
  it("exposes webauthn in dev so settings can issue keys after password login", () => {
    const prev = process.env.WIRE_CONSOLE_AUTH;
    delete process.env.WIRE_CONSOLE_AUTH;
    const cfg = getWireConsoleAuthConfigResponse();
    expect(cfg.mode).toBe("dev");
    expect(cfg.webauthn?.rp_id).toBeTruthy();
    expect(typeof cfg.webauthn?.registration_allowed).toBe("boolean");
    if (prev === undefined) delete process.env.WIRE_CONSOLE_AUTH;
    else process.env.WIRE_CONSOLE_AUTH = prev;
  });

  it("accepts a webauthn login payload in dev instead of requiring a password", () => {
    const prev = process.env.WIRE_CONSOLE_AUTH;
    delete process.env.WIRE_CONSOLE_AUTH;
    const result = authenticateWireConsoleLogin({
      webauthn: {
        credential_id: "cred-1",
        challenge: "unknown",
        client_data_json: Buffer.from("{}", "utf-8").toString("base64url"),
      },
    });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.status).toBe(401);
      expect(result.error).not.toMatch(/passkey, webauthn, or id_token required|passkey or id_token/);
    }
    if (prev === undefined) delete process.env.WIRE_CONSOLE_AUTH;
    else process.env.WIRE_CONSOLE_AUTH = prev;
  });
});
