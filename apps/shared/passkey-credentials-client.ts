import { PASSKEY_COPY } from "./console-copy";
import type { UiLocale } from "./locale";

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

export function formatPasskeyCreatedAt(
  iso?: string,
  locale: UiLocale = "ja",
): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "ja-JP", {
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

export function passkeyDeviceLabel(
  cred: PasskeyCredentialSummary,
  locale: UiLocale = "ja",
): string {
  const copy = PASSKEY_COPY[locale];
  if (cred.purpose === "settlement") return copy.deviceIphoneSettlement;
  if (cred.authenticator_attachment === "cross-platform") return copy.deviceExternal;
  if (cred.authenticator_attachment === "platform") return copy.deviceThisMac;
  return cred.purpose === "login" ? copy.purposeLogin : copy.purposeSettlement;
}
