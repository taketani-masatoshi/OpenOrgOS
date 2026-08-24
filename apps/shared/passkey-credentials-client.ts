export type PasskeyCredentialSummary = {
  credential_id: string;
  purpose: "login" | "settlement";
  operator_id: string;
  approver_id: string;
  created_at?: string;
  authenticator_attachment?: "platform" | "cross-platform";
  rp_id: string;
  managed_by_env: boolean;
  revocable: boolean;
};

export type PasskeyCredentialsApi = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function fetchPasskeyCredentials(
  api: PasskeyCredentialsApi
): Promise<PasskeyCredentialSummary[]> {
  const res = await api<{ ok: boolean; credentials: PasskeyCredentialSummary[] }>(
    "/chat/v1/auth/webauthn/credentials"
  );
  return res.credentials ?? [];
}

export async function revokePasskeyCredential(
  api: PasskeyCredentialsApi,
  credentialId: string
): Promise<void> {
  await api(`/chat/v1/auth/webauthn/credentials/${encodeURIComponent(credentialId)}`, {
    method: "DELETE",
  });
}

export function shortCredentialId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function formatPasskeyCreatedAt(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function passkeyDeviceLabel(cred: PasskeyCredentialSummary): string {
  if (cred.purpose === "settlement") return "iPhone（決済）";
  if (cred.authenticator_attachment === "cross-platform") return "iPhone / 外部";
  if (cred.authenticator_attachment === "platform") return "この Mac（Touch ID）";
  return cred.purpose === "login" ? "ログイン" : "決済";
}
