import {
  browserSupportsWebAuthn,
  getPasskeyWithSimpleWebAuthn,
} from "./webauthn-simple";

export type SettlementCeremonyChallenge = {
  challenge_id: string;
  token: string;
  webauthn_challenge: string;
  rp_id: string;
  allow_credentials: {
    id: string;
    type: string;
    transports?: Array<"hybrid" | "internal" | "usb" | "nfc" | "ble">;
  }[];
  hints?: Array<"hybrid" | "client-device">;
};

export type SettlementCompleteApi = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Mac-side settlement assertion — browser shows hybrid QR; iPhone Face ID signs.
 */
export async function completeSettlementPasskey(
  api: SettlementCompleteApi,
  challenge: SettlementCeremonyChallenge
): Promise<void> {
  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn is not available");
  }
  if (!challenge.allow_credentials?.length) {
    throw new Error("決済 PassKey が未登録です。先に「iPhone で登録」を完了してください");
  }

  const assertion = await getPasskeyWithSimpleWebAuthn({
    challenge: challenge.webauthn_challenge,
    rp_id: challenge.rp_id,
    timeout: 300_000,
    allow_credentials: challenge.allow_credentials.map((c) => ({
      id: c.id,
      type: "public-key" as const,
      transports: (c.transports as Array<"hybrid" | "internal"> | undefined) ?? [
        "hybrid",
        "internal",
      ],
    })),
    user_verification: "required",
    hints: challenge.hints ?? ["hybrid"],
  });

  await api("/chat/v1/settlement/complete", {
    method: "POST",
    body: JSON.stringify({
      challenge_id: challenge.challenge_id,
      token: challenge.token,
      credential_id: assertion.rawId,
      challenge: challenge.webauthn_challenge,
      client_data_json: assertion.response.clientDataJSON,
      authenticator_data_base64: assertion.response.authenticatorData,
      signature_base64: assertion.response.signature,
      flush: true,
    }),
  });
}
