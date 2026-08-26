/** Settings can issue PassKeys after ID/password login, including local dev. */
export function isWebAuthnIssuanceEnabled(
  authConfig: { webauthn?: unknown } | null | undefined,
): boolean {
  return Boolean(authConfig?.webauthn);
}

/** Login screen can offer Touch ID when at least one login PassKey exists. */
export function canSignInWithPasskey(
  authConfig: { webauthn?: { credential_count?: number } } | null | undefined,
): boolean {
  return (authConfig?.webauthn?.credential_count ?? 0) > 0;
}

/** First login key after a session, or an extra key when the admin flag is on. */
export function canRegisterLoginPasskey(
  policy: {
    registration_allowed?: boolean;
    additional_login_registration_allowed?: boolean;
  },
  loginCredentialCount: number,
): boolean {
  if (!policy.registration_allowed) return false;
  return loginCredentialCount === 0 || Boolean(policy.additional_login_registration_allowed);
}
