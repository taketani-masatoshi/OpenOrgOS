import { registerLoginPasskey, type WebAuthnRegisterApi } from "@ops-shared/webauthn-register-client";

export async function registerWithWebAuthn(
  api: WebAuthnRegisterApi,
  opts: { operator_id: string; approver_id: string; bootstrap_token?: string },
): Promise<void> {
  await registerLoginPasskey(api, {
    ...opts,
    optionsPath: "/chat/v1/auth/webauthn/register/options",
    registerPath: "/chat/v1/auth/webauthn/register",
  });
}
