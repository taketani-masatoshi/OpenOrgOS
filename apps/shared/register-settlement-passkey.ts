import { assertWebAuthnRpHost } from "./webauthn-page-origin";
import { buildRegistrationCeremonyOptions } from "./passkey-ceremony";
import {
  browserSupportsWebAuthn,
  createPasskeyWithSimpleWebAuthn,
} from "./webauthn-simple";

export type SettlementRegisterApi = <T>(path: string, init?: RequestInit) => Promise<T>;

type RegisterOptionsResponse = {
  ok: boolean;
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pub_key_cred_params: { type: "public-key"; alg: number }[];
  timeout: number;
  exclude_credentials: {
    id: string;
    type: "public-key";
    transports?: Array<"hybrid" | "internal" | "usb" | "nfc" | "ble">;
  }[];
  authenticator_selection: {
    authenticatorAttachment?: "platform" | "cross-platform";
    residentKey: "preferred";
    userVerification: "required" | "preferred";
  };
  hints?: Array<"hybrid" | "client-device">;
  purpose?: "login" | "settlement";
};

/**
 * Register purpose=settlement on the current console origin.
 * Browser shows the standard hybrid PassKey QR (Chrome / Safari).
 */
export async function registerSettlementPasskey(
  api: SettlementRegisterApi,
  opts: {
    operator_id: string;
    approver_id: string;
    /** Default: chat settlement enroll routes (combined console). */
    optionsPath?: string;
    registerPath?: string;
  }
): Promise<void> {
  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn is not available");
  }

  const optionsPath = opts.optionsPath ?? "/chat/v1/auth/webauthn/register/options";
  const registerPath = opts.registerPath ?? "/chat/v1/auth/webauthn/register";

  const regOpts = await api<RegisterOptionsResponse>(optionsPath, {
    method: "POST",
    body: JSON.stringify({
      operator_id: opts.operator_id,
      approver_id: opts.approver_id,
      purpose: "settlement",
    }),
  });

  assertWebAuthnRpHost(regOpts.rp?.id);

  const ceremony = buildRegistrationCeremonyOptions("settlement", regOpts);
  const cred = await createPasskeyWithSimpleWebAuthn(ceremony);

  await api(registerPath, {
    method: "POST",
    body: JSON.stringify({
      challenge: regOpts.challenge,
      credential_id: cred.rawId,
      client_data_json: cred.response.clientDataJSON,
      attestation_object_base64: cred.response.attestationObject,
      operator_id: opts.operator_id,
      approver_id: opts.approver_id,
      purpose: "settlement",
    }),
  });
}
