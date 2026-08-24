import { assertWebAuthnRpHost } from "./webauthn-page-origin";
import {
  browserSupportsWebAuthn,
  createPasskeyWithSimpleWebAuthn,
} from "./webauthn-simple";

interface WebAuthnRegisterOptionsResponse {
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
}

export type WebAuthnRegisterApi = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function registerLoginPasskey(
  api: WebAuthnRegisterApi,
  opts: {
    operator_id: string;
    approver_id: string;
    bootstrap_token?: string;
    optionsPath: string;
    registerPath: string;
  },
): Promise<void> {
  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn is not available");
  }

  const optionsBody: Record<string, string> = {
    operator_id: opts.operator_id,
    approver_id: opts.approver_id,
  };
  if (opts.bootstrap_token?.trim()) {
    optionsBody.bootstrap_token = opts.bootstrap_token.trim();
  }

  const regOpts = await api<{ ok: boolean } & WebAuthnRegisterOptionsResponse>(opts.optionsPath, {
    method: "POST",
    body: JSON.stringify(optionsBody),
  });

  assertWebAuthnRpHost(regOpts.rp?.id);

  const cred = await createPasskeyWithSimpleWebAuthn(regOpts);

  const registerBody: Record<string, string> = {
    challenge: regOpts.challenge,
    credential_id: cred.rawId,
    client_data_json: cred.response.clientDataJSON,
    attestation_object_base64: cred.response.attestationObject,
    operator_id: opts.operator_id,
    approver_id: opts.approver_id,
  };
  if (opts.bootstrap_token?.trim()) {
    registerBody.bootstrap_token = opts.bootstrap_token.trim();
  }

  await api(opts.registerPath, {
    method: "POST",
    body: JSON.stringify(registerBody),
  });
}
