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

interface WebAuthnRegisterOptionsResponse {
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

export async function registerWithWebAuthn(
  api: <T>(path: string, init?: RequestInit) => Promise<T>,
  opts: { operator_id: string; approver_id: string }
): Promise<void> {
  if (!window.PublicKeyCredential) {
    throw new Error("WebAuthn is not available in this browser");
  }

  const regOpts = await api<{ ok: boolean } & WebAuthnRegisterOptionsResponse>(
    "/console/v1/auth/webauthn/register/options",
    {
      method: "POST",
      body: JSON.stringify({
        operator_id: opts.operator_id,
        approver_id: opts.approver_id,
      }),
    }
  );

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: base64UrlToBuffer(regOpts.challenge),
      rp: regOpts.rp,
      user: {
        id: base64UrlToBuffer(regOpts.user.id),
        name: regOpts.user.name,
        displayName: regOpts.user.displayName,
      },
      pubKeyCredParams: regOpts.pub_key_cred_params,
      timeout: regOpts.timeout,
      excludeCredentials: regOpts.exclude_credentials.map((c) => ({
        id: base64UrlToBuffer(c.id),
        type: c.type,
      })),
      authenticatorSelection: regOpts.authenticator_selection,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("WebAuthn registration was cancelled");
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  await api("/console/v1/auth/webauthn/register", {
    method: "POST",
    body: JSON.stringify({
      challenge: regOpts.challenge,
      credential_id: bufferToBase64Url(new Uint8Array(credential.rawId).buffer),
      client_data_json: bufferToBase64Url(response.clientDataJSON),
      attestation_object_base64: bufferToBase64Url(response.attestationObject),
      operator_id: opts.operator_id,
      approver_id: opts.approver_id,
    }),
  });
}
