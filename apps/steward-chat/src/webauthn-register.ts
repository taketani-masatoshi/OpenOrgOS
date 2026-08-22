import { ensureWebAuthnRpHost } from "@ops-shared/webauthn-page-origin";
import {
  browserSupportsWebAuthn,
  createPasskeyWithSimpleWebAuthn,
} from "@ops-shared/webauthn-simple";

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

export async function registerWithWebAuthn(
  api: <T>(path: string, init?: RequestInit) => Promise<T>,
  opts: { operator_id: string; approver_id: string }
): Promise<void> {
  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn is not available");
  }

  const regOpts = await api<{ ok: boolean } & WebAuthnRegisterOptionsResponse>(
    "/chat/v1/auth/webauthn/register/options",
    {
      method: "POST",
      body: JSON.stringify({
        operator_id: opts.operator_id,
        approver_id: opts.approver_id,
      }),
    }
  );

  if (!ensureWebAuthnRpHost(regOpts.rp?.id)) {
    throw new Error("webauthn origin mismatch");
  }

  const cred = await createPasskeyWithSimpleWebAuthn(regOpts);

  await api("/chat/v1/auth/webauthn/register", {
    method: "POST",
    body: JSON.stringify({
      challenge: regOpts.challenge,
      credential_id: cred.rawId,
      client_data_json: cred.response.clientDataJSON,
      attestation_object_base64: cred.response.attestationObject,
      operator_id: opts.operator_id,
      approver_id: opts.approver_id,
    }),
  });
}
