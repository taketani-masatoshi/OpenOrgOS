import { createHash, randomBytes } from "node:crypto";
import type { WireConsoleUser } from "./session.js";
import { registerSession } from "./session.js";
import {
  coseEc2ToSpkiDer,
  extractCredentialFromAuthData,
  parseAttestationObject,
} from "./webauthn-cbor.js";
import {
  findWebAuthnCredential,
  listWebAuthnCredentialsByPurpose,
  saveWebAuthnCredential,
} from "./webauthn-store.js";
import { rpId } from "./webauthn-shared.js";
import { webauthnOriginsEqual } from "./webauthn-origin.js";
import type { WebAuthnCredentialPurpose } from "../../../../schemas/org/settlement-stepup.js";
import {
  authorizeWebAuthnRegistration,
  isBootstrapTokenRequiredForLoginRegistration,
  isWebAuthnLoginRegistrationAllowedPublic,
  registrationErrorStatus,
  resolveRegistrationHttpStatus,
  type WebAuthnRegistrationFailure,
} from "./webauthn-register-gate.js";
import {
  consumePasskeyBootstrapToken,
  reservePasskeyBootstrapChallenge,
} from "./passkey-bootstrap.js";
import {
  consumeWebAuthnChallenge,
  resetWebAuthnChallengeStoreForTests,
  saveWebAuthnChallenge,
  webauthnChallengeTtlMs,
} from "./webauthn-challenge-store.js";
import { verifyRegistrationAttestation } from "./webauthn-attestation.js";

export { authorizeWebAuthnRegistration, registrationErrorStatus, resolveRegistrationHttpStatus };
export type { WebAuthnRegistrationFailure };

export function isWebAuthnRegistrationAllowed(): boolean {
  return isWebAuthnLoginRegistrationAllowedPublic();
}

/** Login registration gate. Settlement may still register after login keys exist. */
export function isSettlementRegistrationAllowed(): boolean {
  return process.env.WIRE_CONSOLE_WEBAUTHN_DISABLE_REGISTER !== "1";
}

export function createWebAuthnRegisterOptions(
  body: {
    operator_id: string;
    approver_id: string;
    purpose?: WebAuthnCredentialPurpose;
    bootstrap_token?: string;
  },
  opts?: { sessionUser?: WireConsoleUser }
):
  | {
      challenge: string;
      rp: { id: string; name: string };
      user: { id: string; name: string; displayName: string };
      pub_key_cred_params: { type: "public-key"; alg: number }[];
      timeout: number;
      exclude_credentials: {
        id: string;
        type: "public-key";
        transports?: Array<"hybrid" | "internal">;
      }[];
      authenticator_selection: {
        authenticatorAttachment?: "platform" | "cross-platform";
        residentKey: "preferred";
        userVerification: "required";
      };
      hints: Array<"hybrid" | "client-device">;
      purpose: WebAuthnCredentialPurpose;
    }
  | WebAuthnRegistrationFailure {
  const purpose: WebAuthnCredentialPurpose = body.purpose ?? "login";
  const authorized = authorizeWebAuthnRegistration(body, opts?.sessionUser);
  if ("status" in authorized) {
    return { error: authorized.error, status: authorized.status };
  }
  const resolved = authorized;

  // Phase 1: settlement uses the same RP as the console (browser hybrid QR on this page).
  const registerRpId = rpId();

  const challenge = randomBytes(32).toString("base64url");
  if (purpose === "login" && isBootstrapTokenRequiredForLoginRegistration()) {
    if (!body.bootstrap_token?.trim()) {
      return {
        error: "bootstrap token required for first passkey registration in production",
        status: 401,
      };
    }
    const reserved = reservePasskeyBootstrapChallenge({
      token: body.bootstrap_token,
      operatorId: resolved.operator_id,
      challenge,
    });
    if (!reserved.ok) {
      return { error: reserved.error, status: 403 };
    }
  }
  saveWebAuthnChallenge({
    kind: "register",
    challenge,
    expires_at: Date.now() + webauthnChallengeTtlMs(),
    operator_id: resolved.operator_id,
    approver_id: resolved.approver_id,
    purpose,
    rp_id: registerRpId,
    bootstrap_token: body.bootstrap_token?.trim() || undefined,
  });

  const userId = createHash("sha256")
    .update(`${resolved.operator_id}\0${resolved.approver_id}\0${purpose}`, "utf-8")
    .digest()
    .subarray(0, 32)
    .toString("base64url");

  const exclude = listWebAuthnCredentialsByPurpose(purpose, { rpId: registerRpId }).filter(
    (c) => c.operator_id === resolved.operator_id
  );
  const settlement = purpose === "settlement";

  return {
    challenge,
    rp: {
      id: registerRpId,
      name: settlement ? "OrgOS Settlement" : "OrgOS Wire Console",
    },
    user: {
      id: userId,
      name: resolved.operator_id,
      displayName: resolved.operator_id,
    },
    pub_key_cred_params: [{ type: "public-key", alg: -7 }],
    timeout: 300_000,
    exclude_credentials: exclude.map((c) => ({
      id: c.credential_id,
      type: "public-key" as const,
      transports: settlement ? ["hybrid", "internal"] : ["internal"],
    })),
    authenticator_selection: settlement
      ? {
          authenticatorAttachment: "cross-platform",
          residentKey: "preferred",
          userVerification: "required",
        }
      : {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
    hints: settlement ? (["hybrid"] as const) : (["client-device"] as const),
    purpose,
  };
}

export function verifyWebAuthnRegistration(body: {
  challenge: string;
  credential_id: string;
  client_data_json: string;
  attestation_object_base64: string;
  operator_id: string;
  approver_id: string;
  purpose?: WebAuthnCredentialPurpose;
}): { token?: string; user?: WireConsoleUser; credential_id: string } | { error: string } {
  const pending = consumeWebAuthnChallenge(body.challenge, "register");
  if (!pending || !pending.operator_id || !pending.approver_id || !pending.purpose || !pending.rp_id) {
    return { error: "webauthn registration challenge expired or unknown" };
  }

  if (
    pending.operator_id !== body.operator_id.trim() ||
    pending.approver_id !== body.approver_id.trim()
  ) {
    return { error: "operator_id or approver_id mismatch" };
  }

  const purpose = body.purpose ?? pending.purpose;
  if (purpose !== pending.purpose) {
    return { error: "purpose mismatch" };
  }

  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(Buffer.from(body.client_data_json, "base64url").toString("utf-8"));
  } catch {
    return { error: "invalid client_data_json" };
  }
  if (clientData.type !== "webauthn.create" || clientData.challenge !== body.challenge) {
    return { error: "webauthn client data mismatch" };
  }

  const expectedOrigin = process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
  if (!webauthnOriginsEqual(clientData.origin, expectedOrigin)) {
    return {
      error:
        purpose === "settlement"
          ? "settlement webauthn origin mismatch"
          : "webauthn origin mismatch",
    };
  }

  let authData: Buffer;
  try {
    const attestation = parseAttestationObject(body.attestation_object_base64);
    if (attestation.fmt !== "none" && attestation.fmt !== "packed") {
      return { error: `unsupported attestation format: ${attestation.fmt}` };
    }
    const attestationCheck = verifyRegistrationAttestation({
      fmt: attestation.fmt,
      authData: attestation.authData,
      attStmt: attestation.attStmt,
    });
    if (!attestationCheck.ok) {
      return { error: attestationCheck.error };
    }
    authData = attestation.authData;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "invalid attestation object" };
  }

  let extracted: ReturnType<typeof extractCredentialFromAuthData>;
  try {
    extracted = extractCredentialFromAuthData(authData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "invalid authenticator data" };
  }

  const credentialId = extracted.credentialId.toString("base64url");
  if (credentialId !== body.credential_id) {
    return { error: "credential_id mismatch" };
  }
  if (findWebAuthnCredential(credentialId)) {
    return { error: "credential already registered" };
  }

  const spki = coseEc2ToSpkiDer(extracted.cosePublicKey);
  if (!spki) {
    return { error: "unsupported credential public key (expected ES256 P-256)" };
  }

  const rpHash = createHash("sha256").update(pending.rp_id).digest();
  if (!authData.subarray(0, 32).equals(rpHash)) {
    return { error: "webauthn rpId hash mismatch" };
  }
  const flags = authData[32] ?? 0;
  if ((flags & 0x01) === 0) {
    return { error: "webauthn user not present" };
  }
  if ((flags & 0x04) === 0) {
    return { error: "webauthn user not verified" };
  }

  const bootstrapRegistration =
    purpose === "login" && isBootstrapTokenRequiredForLoginRegistration();
  if (bootstrapRegistration && !pending.bootstrap_token) {
    return {
      error: "bootstrap token required for first passkey registration in production",
    };
  }

  saveWebAuthnCredential({
    credential_id: credentialId,
    public_key_spki_base64: spki.toString("base64"),
    operator_id: pending.operator_id,
    approver_id: pending.approver_id,
    sign_count: extracted.signCount,
    purpose,
    rp_id: pending.rp_id,
    authenticator_attachment: purpose === "settlement" ? "cross-platform" : "platform",
  });

  if (bootstrapRegistration && pending.bootstrap_token) {
    const consumed = consumePasskeyBootstrapToken({
      token: pending.bootstrap_token,
      operatorId: pending.operator_id,
      challenge: body.challenge,
    });
    if (!consumed.ok) {
      return { error: consumed.error };
    }
  }

  // Settlement keys never mint a console session (ADR 0037).
  if (purpose === "settlement") {
    return { credential_id: credentialId };
  }

  const user: WireConsoleUser = {
    operator_id: pending.operator_id,
    approver_id: pending.approver_id,
    mode: "prod",
  };
  const session = registerSession(user);
  return { token: session.token, user: session.user, credential_id: credentialId };
}

export function resetWebAuthnRegisterChallengesForTests(): void {
  resetWebAuthnChallengeStoreForTests();
}
