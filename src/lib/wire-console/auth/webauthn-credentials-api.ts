import type { WebAuthnCredentialPurpose } from "../../../../schemas/org/settlement-stepup.js";
import { normalizeRegistrationPersonName as normalizePersonName } from "./webauthn-register-gate.js";
import type { WireConsoleUser } from "./session.js";
import { rpId } from "./webauthn-shared.js";
import {
  credentialPurpose,
  deleteWebAuthnCredential,
  isEnvManagedWebAuthnCredential,
  listWebAuthnCredentials,
} from "./webauthn-store.js";

export type PasskeyCredentialSummary = {
  credential_id: string;
  purpose: WebAuthnCredentialPurpose;
  operator_id: string;
  approver_id: string;
  created_at?: string;
  authenticator_attachment?: "platform" | "cross-platform";
  rp_id: string;
  managed_by_env: boolean;
  revocable: boolean;
};

function credentialBelongsToSession(
  cred: { operator_id: string; approver_id: string },
  session: WireConsoleUser
): boolean {
  return (
    normalizePersonName(cred.operator_id) === normalizePersonName(session.operator_id) &&
    normalizePersonName(cred.approver_id) === normalizePersonName(session.approver_id)
  );
}

export function listPasskeysForSession(
  session: WireConsoleUser
): { credentials: PasskeyCredentialSummary[] } {
  const wantRp = rpId();
  const credentials = listWebAuthnCredentials()
    .filter((c) => (c.rp_id ?? rpId()) === wantRp)
    .filter((c) => credentialBelongsToSession(c, session))
    .map((c) => {
      const managed = isEnvManagedWebAuthnCredential(c.credential_id);
      return {
        credential_id: c.credential_id,
        purpose: credentialPurpose(c),
        operator_id: c.operator_id,
        approver_id: c.approver_id,
        created_at: c.created_at,
        authenticator_attachment: c.authenticator_attachment,
        rp_id: c.rp_id ?? wantRp,
        managed_by_env: managed,
        revocable: !managed,
      };
    })
    .sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });

  return { credentials };
}

export function revokePasskeyForSession(
  session: WireConsoleUser,
  credentialId: string
): { ok: true } | { error: string; status: number } {
  const id = credentialId.trim();
  if (!id) {
    return { error: "credential_id required", status: 422 };
  }

  const cred = listWebAuthnCredentials().find((c) => c.credential_id === id);
  if (!cred) {
    return { error: "passkey not found", status: 404 };
  }
  if (!credentialBelongsToSession(cred, session)) {
    return { error: "passkey does not belong to your session", status: 403 };
  }

  const result = deleteWebAuthnCredential(id);
  if (!result.ok) {
    return {
      error: result.error ?? "could not revoke passkey",
      status: result.error?.includes("environment") ? 403 : 404,
    };
  }
  return { ok: true };
}
