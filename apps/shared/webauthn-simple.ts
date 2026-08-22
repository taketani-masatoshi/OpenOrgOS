import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

export { browserSupportsWebAuthn };

export type OrgOsRegisterOptions = {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pub_key_cred_params: { type: "public-key"; alg: number }[];
  timeout: number;
  exclude_credentials?: {
    id: string;
    type: "public-key";
    transports?: Array<"hybrid" | "internal" | "usb" | "nfc" | "ble">;
  }[];
  authenticator_selection?: PublicKeyCredentialCreationOptionsJSON["authenticatorSelection"];
  hints?: PublicKeyCredentialCreationOptionsJSON["hints"];
};

export type OrgOsLoginOptions = {
  challenge: string;
  rp_id: string;
  timeout: number;
  allow_credentials?: {
    id: string;
    type: "public-key";
    transports?: Array<"hybrid" | "internal" | "usb" | "nfc" | "ble">;
  }[];
  user_verification?: PublicKeyCredentialRequestOptionsJSON["userVerification"];
  hints?: PublicKeyCredentialRequestOptionsJSON["hints"];
};

export async function createPasskeyWithSimpleWebAuthn(
  opts: OrgOsRegisterOptions
): Promise<RegistrationResponseJSON> {
  const optionsJSON: PublicKeyCredentialCreationOptionsJSON = {
    challenge: opts.challenge,
    rp: opts.rp,
    user: opts.user,
    pubKeyCredParams: opts.pub_key_cred_params,
    timeout: opts.timeout,
    excludeCredentials: (opts.exclude_credentials ?? []).map((c) => ({
      id: c.id,
      type: "public-key",
      transports: c.transports,
    })),
    authenticatorSelection: opts.authenticator_selection,
    hints: opts.hints,
  };
  return startRegistration({ optionsJSON });
}

export async function getPasskeyWithSimpleWebAuthn(
  opts: OrgOsLoginOptions
): Promise<AuthenticationResponseJSON> {
  const optionsJSON: PublicKeyCredentialRequestOptionsJSON = {
    challenge: opts.challenge,
    rpId: opts.rp_id,
    timeout: opts.timeout,
    allowCredentials: (opts.allow_credentials ?? []).map((c) => ({
      id: c.id,
      type: "public-key",
      transports: c.transports,
    })),
    userVerification: opts.user_verification ?? "required",
    hints: opts.hints,
  };
  return startAuthentication({ optionsJSON });
}
