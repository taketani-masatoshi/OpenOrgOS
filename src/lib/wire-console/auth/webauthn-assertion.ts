import { createHash } from "node:crypto";
import { verifyWebAuthnAssertionSignature } from "./webauthn-verify.js";
import { webauthnOriginsEqual } from "./webauthn-origin.js";

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;

export type VerifyWebAuthnAssertionResult =
  | { ok: true; signCount: number }
  | { ok: false; error: string };

/**
 * Server-side WebAuthn assertion checks (W3C Level 2 §7.2 subset).
 * Shared by login and settlement step-up.
 */
export function verifyWebAuthnAssertion(opts: {
  expectedRpId: string;
  expectedOrigin: string;
  clientDataJsonBase64: string;
  authenticatorDataBase64: string;
  signatureBase64: string;
  publicKeySpkiBase64: string;
  previousSignCount?: number;
}): VerifyWebAuthnAssertionResult {
  const expectedOrigin = opts.expectedOrigin.trim();
  if (!expectedOrigin) {
    return { ok: false, error: "webauthn expected origin not configured" };
  }

  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(
      Buffer.from(opts.clientDataJsonBase64, "base64url").toString("utf-8"),
    );
  } catch {
    return { ok: false, error: "invalid client_data_json" };
  }

  if (!clientData.origin || !webauthnOriginsEqual(clientData.origin, expectedOrigin)) {
    return { ok: false, error: "webauthn origin mismatch" };
  }

  let authData: Buffer;
  try {
    authData = Buffer.from(opts.authenticatorDataBase64, "base64url");
  } catch {
    return { ok: false, error: "invalid authenticator_data" };
  }
  if (authData.length < 37) {
    return { ok: false, error: "authenticator_data too short" };
  }

  const expectedRpHash = createHash("sha256").update(opts.expectedRpId).digest();
  const actualRpHash = authData.subarray(0, 32);
  if (!expectedRpHash.equals(actualRpHash)) {
    return { ok: false, error: "webauthn rpId hash mismatch" };
  }

  const flags = authData[32]!;
  if ((flags & FLAG_UP) === 0) {
    return { ok: false, error: "webauthn user not present" };
  }
  if ((flags & FLAG_UV) === 0) {
    return { ok: false, error: "webauthn user not verified" };
  }

  const signatureOk = verifyWebAuthnAssertionSignature({
    publicKeySpkiBase64: opts.publicKeySpkiBase64,
    authenticatorDataBase64: opts.authenticatorDataBase64,
    clientDataJsonBase64: opts.clientDataJsonBase64,
    signatureBase64: opts.signatureBase64,
  });
  if (!signatureOk) {
    return { ok: false, error: "invalid webauthn assertion signature" };
  }

  let signCount: number;
  try {
    signCount = authData.readUInt32BE(33);
  } catch {
    return { ok: false, error: "webauthn sign count unreadable" };
  }

  const previous = opts.previousSignCount ?? 0;
  if (signCount > 0 && signCount <= previous) {
    return { ok: false, error: "webauthn sign count replay" };
  }

  return { ok: true, signCount };
}
