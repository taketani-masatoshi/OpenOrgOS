import { randomBytes, timingSafeEqual } from "node:crypto";
import type { WireConsoleUser } from "./session.js";
import { registerSession } from "./session.js";
import {
  isWebAuthnTestSecretAllowed,
  verifyWebAuthnAssertionSignature,
} from "./webauthn-verify.js";
import {
  findWebAuthnCredential,
  listWebAuthnCredentials,
  updateWebAuthnSignCount,
} from "./webauthn-store.js";
import { isWebAuthnRegistrationAllowed } from "./webauthn-register.js";
import { rpId } from "./webauthn-shared.js";

export { rpId };

const pendingChallenges = new Map<string, { challenge: string; expires_at: number }>();

export function getWebAuthnConfig() {
  return {
    rp_id: rpId(),
    credential_count: listWebAuthnCredentials().length,
    registration_allowed: isWebAuthnRegistrationAllowed(),
  };
}

export function createWebAuthnLoginOptions(): {
  challenge: string;
  rp_id: string;
  timeout: number;
  allow_credentials: { id: string; type: "public-key" }[];
} {
  const challenge = randomBytes(32).toString("base64url");
  pendingChallenges.set(challenge, {
    challenge,
    expires_at: Date.now() + 5 * 60_000,
  });
  return {
    challenge,
    rp_id: rpId(),
    timeout: 300_000,
    allow_credentials: listWebAuthnCredentials().map((c) => ({
      id: c.credential_id,
      type: "public-key" as const,
    })),
  };
}

export function verifyWebAuthnLogin(body: {
  credential_id: string;
  challenge: string;
  client_data_json: string;
  authenticator_data_base64?: string;
  signature_base64?: string;
}): { token: string; user: WireConsoleUser } | { error: string } {
  const pending = pendingChallenges.get(body.challenge);
  if (!pending || pending.expires_at < Date.now()) {
    return { error: "webauthn challenge expired or unknown" };
  }
  pendingChallenges.delete(body.challenge);

  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(Buffer.from(body.client_data_json, "base64url").toString("utf-8"));
  } catch {
    return { error: "invalid client_data_json" };
  }
  if (clientData.type !== "webauthn.get" || clientData.challenge !== body.challenge) {
    return { error: "webauthn client data mismatch" };
  }
  const expectedOrigin = process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
  if (expectedOrigin && clientData.origin && clientData.origin !== expectedOrigin) {
    return { error: "webauthn origin mismatch" };
  }

  const cred = findWebAuthnCredential(body.credential_id);
  if (!cred) {
    return { error: "unknown webauthn credential" };
  }

  const publicKeySpki = cred.public_key_spki_base64;
  const testSecret = process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;

  if (testSecret && isWebAuthnTestSecretAllowed() && body.signature_base64) {
    const expected = Buffer.from(testSecret, "utf-8");
    const got = Buffer.from(body.signature_base64, "base64url");
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
      return { error: "invalid webauthn test signature" };
    }
  } else {
    if (!body.authenticator_data_base64 || !body.signature_base64) {
      return { error: "authenticator_data_base64 and signature_base64 required" };
    }
    if (!publicKeySpki) {
      return { error: "credential missing public_key_spki_base64" };
    }
    const ok = verifyWebAuthnAssertionSignature({
      publicKeySpkiBase64: publicKeySpki,
      authenticatorDataBase64: body.authenticator_data_base64,
      clientDataJsonBase64: body.client_data_json,
      signatureBase64: body.signature_base64,
    });
    if (!ok) {
      return { error: "invalid webauthn assertion signature" };
    }

    try {
      const authData = Buffer.from(body.authenticator_data_base64, "base64url");
      const signCount = authData.readUInt32BE(33);
      if (cred.sign_count !== undefined && signCount > 0 && signCount <= cred.sign_count) {
        return { error: "webauthn sign count replay" };
      }
      updateWebAuthnSignCount(body.credential_id, signCount);
    } catch {
      /* sign count best-effort */
    }
  }

  const user: WireConsoleUser = {
    operator_id: cred.operator_id,
    approver_id: cred.approver_id,
    mode: "prod",
  };
  return registerSession(user);
}

export function resetWebAuthnChallengesForTests(): void {
  pendingChallenges.clear();
}
