import { readUiLocale, type UiLocale } from "./locale";
import { WebAuthnRedirectInProgressError } from "./webauthn-page-origin";
import { WEBAUTHN_COPY } from "./webauthn-copy";

export type WebAuthnUserMessageOpts = {
  expectedOrigin?: string;
  rpId?: string;
  /** login: Touch ID cancel · settlement: hybrid / Bluetooth hints */
  purpose?: "login" | "settlement";
  locale?: UiLocale;
};

function resolveLocale(opts?: WebAuthnUserMessageOpts): UiLocale {
  if (opts?.locale) return opts.locale;
  if (typeof document !== "undefined") return readUiLocale();
  return "ja";
}

function originHint(
  copy: (typeof WEBAUTHN_COPY)["ja"],
  opts?: WebAuthnUserMessageOpts,
): string {
  if (opts?.expectedOrigin) {
    try {
      const u = new URL(opts.expectedOrigin);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        return copy.localhostHint(u.origin);
      }
      return copy.originHint(u.origin);
    } catch {
      /* fall through */
    }
  }
  if (opts?.rpId) {
    return copy.rpHint(opts.rpId);
  }
  return copy.defaultOrigin;
}

/** Map WebAuthn / API errors to short user copy (no technical dumps). */
export function webauthnUserMessage(err: unknown, opts?: WebAuthnUserMessageOpts): string {
  const copy = WEBAUTHN_COPY[resolveLocale(opts)];
  if (err instanceof WebAuthnRedirectInProgressError) {
    return copy.redirecting;
  }

  const name = err instanceof DOMException ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);
  const text = `${name} ${raw}`.toLowerCase();

  if (/bootstrap token required|bootstrap token/i.test(raw)) {
    return copy.bootstrapRequired;
  }
  if (/invalid.*bootstrap|bootstrap token invalid|expired|already used|must be reserved/i.test(text)) {
    return copy.bootstrapInvalid;
  }
  if (/cannot revoke your only login passkey/i.test(raw)) {
    return copy.cannotRevokeOnly;
  }
  if (/csrf_origin_mismatch/i.test(raw)) {
    return copy.csrf;
  }
  if (name === "NotAllowedError" || /cancel/i.test(raw)) {
    if (opts?.purpose === "login") {
      return copy.loginCancel;
    }
    return copy.settlementCancel;
  }
  if (name === "InvalidStateError" || /already registered|exclude/i.test(text)) {
    return copy.alreadyRegistered;
  }
  if (name === "SecurityError" || /origin mismatch|rpid hash|webauthn origin/i.test(text)) {
    return originHint(copy, opts);
  }
  if (/not available/i.test(text)) {
    return copy.unsupported;
  }
  if (/timed out|timeout|abort/i.test(text)) {
    return copy.timeout;
  }
  if (/bluetooth|hybrid|no authenticator|not found/i.test(text)) {
    return copy.noIphone;
  }
  if (/決済 PassKey が未登録|settlement.*未登録/i.test(raw)) {
    return copy.settlementMissing;
  }
  if (/failed to fetch|networkerror|load failed|http 5/i.test(text)) {
    return copy.unreachable;
  }
  if (/registration disabled/i.test(text)) {
    return copy.registrationDisabled;
  }
  if (/challenge expired|unknown challenge|store corrupt|credential store unreadable/i.test(text)) {
    return copy.challengeExpired;
  }
  if (/authenticated session required|session required/i.test(text)) {
    return copy.sessionRequired;
  }
  if (/mismatch|does not belong|unknown operator/i.test(text)) {
    return copy.mismatch;
  }
  if (/unauthorized|401/.test(text)) {
    return copy.unauthorized;
  }
  return raw.length > 120 ? copy.generic : raw;
}
