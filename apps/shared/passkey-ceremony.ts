/**
 * PassKey ceremony SSOT — login (Mac Touch ID) vs settlement (iPhone hybrid QR).
 * ADR 0037: never infer hints from credential transports.
 */

export type PasskeyCeremonyKind = "login" | "settlement";

export type PasskeyCeremonyHint = "hybrid" | "client-device";

export type PasskeyCeremonyTransport = "hybrid" | "internal";

export type PasskeyCredentialDescriptor = {
  id: string;
  type: string;
  transports?: Array<PasskeyCeremonyTransport | "usb" | "nfc" | "ble">;
};

const CEREMONY = {
  login: {
    ceremony_kind: "login" as const,
    hints: ["client-device"] as const,
    defaultAuthTransports: ["internal"] as const,
    defaultRegTransports: ["internal"] as const,
  },
  settlement: {
    ceremony_kind: "settlement" as const,
    hints: ["hybrid"] as const,
    defaultAuthTransports: ["hybrid", "internal"] as const,
    defaultRegTransports: ["hybrid", "internal"] as const,
  },
} satisfies Record<
  PasskeyCeremonyKind,
  {
    ceremony_kind: PasskeyCeremonyKind;
    hints: readonly PasskeyCeremonyHint[];
    defaultAuthTransports: readonly PasskeyCeremonyTransport[];
    defaultRegTransports: readonly PasskeyCeremonyTransport[];
  }
>;

export const PASSKEY_CEREMONY = CEREMONY;

export function ceremonyKindFromPurpose(
  purpose: "login" | "settlement" | undefined
): PasskeyCeremonyKind {
  return purpose === "settlement" ? "settlement" : "login";
}

/** Resolve WebAuthn hints — kind SSOT wins over conflicting server hints. */
export function resolveCeremonyHints(
  kind: PasskeyCeremonyKind,
  serverHints?: readonly PasskeyCeremonyHint[] | null
): PasskeyCeremonyHint[] {
  const expected = CEREMONY[kind].hints;
  if (!serverHints?.length) {
    return [...expected];
  }
  const matches = serverHints.filter((h): h is PasskeyCeremonyHint =>
    (expected as readonly PasskeyCeremonyHint[]).includes(h)
  );
  return matches.length > 0 ? matches : [...expected];
}

function normalizeTransports(
  kind: PasskeyCeremonyKind,
  mode: "auth" | "reg",
  transports?: PasskeyCredentialDescriptor["transports"]
): PasskeyCeremonyTransport[] {
  const defaults =
    mode === "auth"
      ? CEREMONY[kind].defaultAuthTransports
      : CEREMONY[kind].defaultRegTransports;
  if (!transports?.length) {
    return [...defaults];
  }
  const allowed = new Set<PasskeyCeremonyTransport>(["hybrid", "internal"]);
  const filtered = transports.filter(
    (t): t is PasskeyCeremonyTransport => allowed.has(t as PasskeyCeremonyTransport)
  );
  return filtered.length > 0 ? filtered : [...defaults];
}

/** Map allowCredentials / excludeCredentials — normalize transports only. */
export function mapCeremonyCredentials(
  kind: PasskeyCeremonyKind,
  creds: PasskeyCredentialDescriptor[],
  mode: "auth" | "reg" = "auth"
): { id: string; type: "public-key"; transports: PasskeyCeremonyTransport[] }[] {
  return creds.map((c) => ({
    id: c.id,
    type: "public-key" as const,
    transports: normalizeTransports(kind, mode, c.transports),
  }));
}

export function buildAuthenticationCeremonyOptions(opts: {
  kind: PasskeyCeremonyKind;
  challenge: string;
  rp_id: string;
  timeout: number;
  allow_credentials?: PasskeyCredentialDescriptor[];
  user_verification?: "required" | "preferred";
  server_hints?: readonly PasskeyCeremonyHint[] | null;
}): {
  ceremony_kind: PasskeyCeremonyKind;
  challenge: string;
  rp_id: string;
  timeout: number;
  allow_credentials: { id: string; type: "public-key"; transports: PasskeyCeremonyTransport[] }[];
  user_verification: "required" | "preferred";
  hints: PasskeyCeremonyHint[];
} {
  return {
    ceremony_kind: opts.kind,
    challenge: opts.challenge,
    rp_id: opts.rp_id,
    timeout: opts.timeout,
    allow_credentials: mapCeremonyCredentials(opts.kind, opts.allow_credentials ?? [], "auth"),
    user_verification: opts.user_verification ?? "required",
    hints: resolveCeremonyHints(opts.kind, opts.server_hints),
  };
}

export function buildRegistrationCeremonyOptions<
  T extends {
    challenge: string;
    rp: { id: string; name: string };
    user: { id: string; name: string; displayName: string };
    pub_key_cred_params: { type: "public-key"; alg: number }[];
    timeout: number;
    exclude_credentials?: PasskeyCredentialDescriptor[];
    authenticator_selection?: {
      authenticatorAttachment?: "platform" | "cross-platform";
      residentKey: "preferred";
      userVerification: "required" | "preferred";
    };
    hints?: readonly PasskeyCeremonyHint[];
  }
>(kind: PasskeyCeremonyKind, opts: T): T & {
  ceremony_kind: PasskeyCeremonyKind;
  exclude_credentials: { id: string; type: "public-key"; transports: PasskeyCeremonyTransport[] }[];
  hints: PasskeyCeremonyHint[];
} {
  return {
    ...opts,
    ceremony_kind: kind,
    exclude_credentials: mapCeremonyCredentials(kind, opts.exclude_credentials ?? [], "reg"),
    hints: resolveCeremonyHints(kind, opts.hints),
  };
}
