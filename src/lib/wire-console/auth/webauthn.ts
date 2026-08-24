import { randomBytes, timingSafeEqual } from "node:crypto";
import type { WireConsoleUser } from "./session.js";
import { registerSession } from "./session.js";
import { isWebAuthnTestSecretAllowed } from "./webauthn-verify.js";
import { verifyWebAuthnAssertion } from "./webauthn-assertion.js";
import { webauthnOriginsEqual } from "./webauthn-origin.js";
import {
  credentialPurpose,
  findWebAuthnCredential,
  listWebAuthnCredentialsByPurpose,
  updateWebAuthnSignCount,
  WebAuthnCredentialStoreCorruptError,
} from "./webauthn-store.js";
import {
  isBootstrapTokenRequiredForLoginRegistration,
  isLoginPasskeyBootstrap,
} from "./webauthn-register-gate.js";
import { isWebAuthnRegistrationAllowed, isSettlementRegistrationAllowed } from "./webauthn-register.js";
import { isAdditionalLoginPasskeyRegistrationAllowed } from "./webauthn-register-gate.js";
import { rpId } from "./webauthn-shared.js";
import {
  consumeWebAuthnChallenge,
  resetWebAuthnChallengeStoreForTests,
  saveWebAuthnChallenge,
  webauthnChallengeTtlMs,
} from "./webauthn-challenge-store.js";

export { rpId };

export function getWebAuthnConfig() {
  try {
    const loginCreds = listWebAuthnCredentialsByPurpose("login", { rpId: rpId() });
    const settlementCreds = listWebAuthnCredentialsByPurpose("settlement", { rpId: rpId() });
    const approveOrigin =
      process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN?.trim() || "https://approve.oorgos.org";
    return {
      rp_id: rpId(),
      credential_count: loginCreds.length,
      settlement_count: settlementCreds.length,
      registration_allowed: isWebAuthnRegistrationAllowed(),
      settlement_registration_allowed: isSettlementRegistrationAllowed(),
      additional_login_registration_allowed: isAdditionalLoginPasskeyRegistrationAllowed(),
      login_registration_requires_session: true,
      login_registration_bootstrap: isLoginPasskeyBootstrap(),
      bootstrap_token_required: isBootstrapTokenRequiredForLoginRegistration(),
      approve_origin: approveOrigin.replace(/\/$/, ""),
      origin: (process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN ?? "").replace(/\/$/, "") || undefined,
      credential_store_ok: true as const,
    };
  } catch (error) {
    if (error instanceof WebAuthnCredentialStoreCorruptError) {
      const approveOrigin =
        process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN?.trim() || "https://approve.oorgos.org";
      return {
        rp_id: rpId(),
        credential_count: 0,
        settlement_count: 0,
        registration_allowed: false,
        settlement_registration_allowed: false,
        additional_login_registration_allowed: false,
        login_registration_requires_session: true,
        login_registration_bootstrap: false,
        bootstrap_token_required: false,
        approve_origin: approveOrigin.replace(/\/$/, ""),
        origin: (process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN ?? "").replace(/\/$/, "") || undefined,
        credential_store_ok: false as const,
        credential_store_error: error.message,
      };
    }
    throw error;
  }
}

export function createWebAuthnLoginOptions(): {
  challenge: string;
  rp_id: string;
  timeout: number;
  allow_credentials: { id: string; type: "public-key"; transports?: Array<"internal"> }[];
  user_verification: "required";
  hints: Array<"client-device">;
} {
  const challenge = randomBytes(32).toString("base64url");
  saveWebAuthnChallenge({
    kind: "login",
    challenge,
    expires_at: Date.now() + webauthnChallengeTtlMs(),
  });
  const loginCreds = listWebAuthnCredentialsByPurpose("login", { rpId: rpId() });
  return {
    challenge,
    rp_id: rpId(),
    timeout: 300_000,
    allow_credentials: loginCreds.map((c) => ({
      id: c.credential_id,
      type: "public-key" as const,
      transports: ["internal"] as Array<"internal">,
    })),
    user_verification: "required" as const,
    hints: ["client-device"] as const,
  };
}

export function verifyWebAuthnLogin(body: {
  credential_id: string;
  challenge: string;
  client_data_json: string;
  authenticator_data_base64?: string;
  signature_base64?: string;
}): { token: string; user: WireConsoleUser } | { error: string } {
  const pending = consumeWebAuthnChallenge(body.challenge, "login");
  if (!pending) {
    return { error: "webauthn challenge expired or unknown" };
  }

  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(Buffer.from(body.client_data_json, "base64url").toString("utf-8"));
  } catch {
    return { error: "invalid client_data_json" };
  }
  if (clientData.type !== "webauthn.get" || clientData.challenge !== body.challenge) {
    return { error: "webauthn client data mismatch" };
  }

  const cred = findWebAuthnCredential(body.credential_id);
  if (!cred) {
    return { error: "unknown webauthn credential" };
  }
  if (credentialPurpose(cred) !== "login") {
    return { error: "settlement credential cannot create a login session" };
  }
  if ((cred.rp_id ?? rpId()) !== rpId()) {
    return { error: "webauthn credential rp_id mismatch for login" };
  }

  const publicKeySpki = cred.public_key_spki_base64;
  const testSecret = process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
  const expectedOrigin = (process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN ?? "").replace(/\/$/, "");

  if (testSecret && isWebAuthnTestSecretAllowed() && body.signature_base64) {
    const expected = Buffer.from(testSecret, "utf-8");
    const got = Buffer.from(body.signature_base64, "base64url");
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
      return { error: "invalid webauthn test signature" };
    }
    if (!body.authenticator_data_base64) {
      return { error: "authenticator_data_base64 required" };
    }
    if (!publicKeySpki) {
      return { error: "credential missing public_key_spki_base64" };
    }
    const verified = verifyWebAuthnAssertion({
      expectedRpId: rpId(),
      expectedOrigin,
      clientDataJsonBase64: body.client_data_json,
      authenticatorDataBase64: body.authenticator_data_base64,
      signatureBase64: body.signature_base64,
      publicKeySpkiBase64: publicKeySpki,
      previousSignCount: cred.sign_count ?? 0,
      skipSignatureVerification: true,
    });
    if (!verified.ok) {
      return { error: verified.error };
    }
    updateWebAuthnSignCount(body.credential_id, verified.signCount);
  } else {
    if (!body.authenticator_data_base64 || !body.signature_base64) {
      return { error: "authenticator_data_base64 and signature_base64 required" };
    }
    if (!publicKeySpki) {
      return { error: "credential missing public_key_spki_base64" };
    }
    const verified = verifyWebAuthnAssertion({
      expectedRpId: rpId(),
      expectedOrigin,
      clientDataJsonBase64: body.client_data_json,
      authenticatorDataBase64: body.authenticator_data_base64,
      signatureBase64: body.signature_base64,
      publicKeySpkiBase64: publicKeySpki,
      previousSignCount: cred.sign_count ?? 0,
    });
    if (!verified.ok) {
      return { error: verified.error };
    }
    updateWebAuthnSignCount(body.credential_id, verified.signCount);
  }

  const user: WireConsoleUser = {
    operator_id: cred.operator_id,
    approver_id: cred.approver_id,
    mode: "prod",
  };
  return registerSession(user);
}

export function resetWebAuthnChallengesForTests(): void {
  resetWebAuthnChallengeStoreForTests();
}
