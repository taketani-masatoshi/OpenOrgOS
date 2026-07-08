function base64UrlToBuffer(value: string): ArrayBuffer {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface WebAuthnOptionsResponse {
  challenge: string;
  rp_id: string;
  timeout: number;
  allow_credentials: { id: string; type: "public-key" }[];
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

  if (!window.PublicKeyCredential) {
    throw new Error("WebAuthn is not available in this browser");
  }

  const allowCredentials = optsRes.allow_credentials.map((c) => ({
    id: base64UrlToBuffer(c.id),
    type: c.type,
  }));

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: base64UrlToBuffer(optsRes.challenge),
      rpId: optsRes.rp_id,
      timeout: optsRes.timeout,
      allowCredentials,
      userVerification: "preferred",
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error("WebAuthn sign-in was cancelled");
  }

  const response = assertion.response as AuthenticatorAssertionResponse;
  await api("/console/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      webauthn: {
        credential_id: bufferToBase64Url(new Uint8Array(assertion.rawId).buffer),
        challenge: optsRes.challenge,
        client_data_json: bufferToBase64Url(response.clientDataJSON),
        authenticator_data_base64: bufferToBase64Url(response.authenticatorData),
        signature_base64: bufferToBase64Url(response.signature),
      },
    }),
  });
}
