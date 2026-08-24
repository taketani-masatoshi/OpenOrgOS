import { registerLoginPasskey, type WebAuthnRegisterApi } from "@ops-shared/webauthn-register-client";
import { registerSettlementPasskey } from "@ops-shared/register-settlement-passkey";

export async function registerWithWebAuthn(
  api: WebAuthnRegisterApi,
  opts: { operator_id: string; approver_id: string; bootstrap_token?: string },
): Promise<void> {
  await registerLoginPasskey(api, {
    ...opts,
    optionsPath: "/console/v1/auth/webauthn/register/options",
    registerPath: "/console/v1/auth/webauthn/register",
  });
}

export async function registerSettlementWithWebAuthn(
  api: WebAuthnRegisterApi,
  opts: { operator_id: string; approver_id: string },
): Promise<void> {
  await registerSettlementPasskey(api, {
    ...opts,
    optionsPath: "/console/v1/auth/webauthn/register/options",
    registerPath: "/console/v1/auth/webauthn/register",
  });
}
