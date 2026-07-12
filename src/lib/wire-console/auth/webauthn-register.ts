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
  listWebAuthnCredentials,
  saveWebAuthnCredential,
} from "./webauthn-store.js";
import { rpId } from "./webauthn-shared.js";

const pendingRegisterChallenges = new Map<
  string,
  { challenge: string; operator_id: string; approver_id: string; expires_at: number }
>();

export function isWebAuthnRegistrationAllowed(): boolean {
  if (process.env.WIRE_CONSOLE_WEBAUTHN_DISABLE_REGISTER === "1") return false;
  if (process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_REGISTER === "1") return true;
  return listWebAuthnCredentials().length === 0;
}

export function createWebAuthnRegisterOptions(body: { operator_id: string; approver_id: string }):
  | {
      challenge: string;
      rp: { id: string; name: string };
      user: { id: string; name: string; displayName: string };
      pub_key_cred_params: { type: "public-key"; alg: number }[];
      timeout: number;
      exclude_credentials: { id: string; type: "public-key" }[];
      authenticator_selection: {
        residentKey: "preferred";
        userVerification: "preferred";
      };
    }
  | { error: string } {
  if (!isWebAuthnRegistrationAllowed()) {
    return { error: "webauthn registration disabled" };
  }
  if (!body.operator_id?.trim() || !body.approver_id?.trim()) {
    return { error: "operator_id and approver_id required" };
  }

  const challenge = randomBytes(32).toString("base64url");
  pendingRegisterChallenges.set(challenge, {
    challenge,
    operator_id: body.operator_id.trim(),
    approver_id: body.approver_id.trim(),
    expires_at: Date.now() + 5 * 60_000,
  });

  const userId = createHash("sha256")
    .update(`${body.operator_id}\0${body.approver_id}`, "utf-8")
    .digest()
    .subarray(0, 32)
    .toString("base64url");

  return {
    challenge,
    rp: { id: rpId(), name: "OrgOS Wire Console" },
    user: {
      id: userId,
      name: body.operator_id.trim(),
      displayName: body.operator_id.trim(),
    },
    pub_key_cred_params: [{ type: "public-key", alg: -7 }],
    timeout: 300_000,
    exclude_credentials: listWebAuthnCredentials().map((c) => ({
      id: c.credential_id,
      type: "public-key" as const,
    })),
    authenticator_selection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  };
}

export function verifyWebAuthnRegistration(body: {
  challenge: string;
  credential_id: string;
  client_data_json: string;
  attestation_object_base64: string;
  operator_id: string;
  approver_id: string;
}): { token: string; user: WireConsoleUser } | { error: string } {
  if (!isWebAuthnRegistrationAllowed()) {
    return { error: "webauthn registration disabled" };
  }

  const pending = pendingRegisterChallenges.get(body.challenge);
  if (!pending || pending.expires_at < Date.now()) {
    return { error: "webauthn registration challenge expired or unknown" };
  }
  pendingRegisterChallenges.delete(body.challenge);

  if (
    pending.operator_id !== body.operator_id.trim() ||
    pending.approver_id !== body.approver_id.trim()
  ) {
    return { error: "operator_id or approver_id mismatch" };
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
  if (expectedOrigin && clientData.origin && clientData.origin !== expectedOrigin) {
    return { error: "webauthn origin mismatch" };
  }

  let authData: Buffer;
  try {
    const attestation = parseAttestationObject(body.attestation_object_base64);
    if (attestation.fmt !== "none" && attestation.fmt !== "packed") {
      return { error: `unsupported attestation format: ${attestation.fmt}` };
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

  const rpHash = createHash("sha256").update(rpId()).digest();
  if (!authData.subarray(0, 32).equals(rpHash)) {
    return { error: "webauthn rpId hash mismatch" };
  }

  saveWebAuthnCredential({
    credential_id: credentialId,
    public_key_spki_base64: spki.toString("base64"),
    operator_id: pending.operator_id,
    approver_id: pending.approver_id,
    sign_count: extracted.signCount,
  });

  const user: WireConsoleUser = {
    operator_id: pending.operator_id,
    approver_id: pending.approver_id,
    mode: "prod",
  };
  return registerSession(user);
}

export function resetWebAuthnRegisterChallengesForTests(): void {
  pendingRegisterChallenges.clear();
}
