import { assertWebAuthnRpHost } from "@ops-shared/webauthn-page-origin";
import {
  browserSupportsWebAuthn,
  getPasskeyWithSimpleWebAuthn,
} from "@ops-shared/webauthn-simple";

interface WebAuthnOptionsResponse {
  challenge: string;
  rp_id: string;
  timeout: number;
  allow_credentials: {
    id: string;
    type: "public-key";
    transports?: Array<"hybrid" | "internal" | "usb" | "nfc" | "ble">;
  }[];
  user_verification?: "required" | "preferred";
  hints?: Array<"client-device" | "hybrid">;
}

export async function loginWithWebAuthn(
  api: <T>(path: string, init?: RequestInit) => Promise<T>,
  opts?: { e2e?: boolean }
): Promise<void> {
  const optsRes = await api<{ ok: boolean } & WebAuthnOptionsResponse>(
    "/console/v1/auth/webauthn/options",
    { method: "POST" }
  );

  if (opts?.e2e) {
    await api("/console/v1/auth/webauthn/e2e-complete", {
      method: "POST",
      body: JSON.stringify({ challenge: optsRes.challenge }),
    });
    return;
  }

  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn is not available");
  }

  assertWebAuthnRpHost(optsRes.rp_id);

  const assertion = await getPasskeyWithSimpleWebAuthn(optsRes);

  await api("/console/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      webauthn: {
        credential_id: assertion.rawId,
        challenge: optsRes.challenge,
        client_data_json: assertion.response.clientDataJSON,
        authenticator_data_base64: assertion.response.authenticatorData,
        signature_base64: assertion.response.signature,
      },
    }),
  });
}
