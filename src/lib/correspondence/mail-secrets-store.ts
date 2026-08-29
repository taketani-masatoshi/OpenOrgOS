/**
 * Mail secrets (SMTP / IMAP) stored per tenant in a gitignored 0600 env file.
 * Path: src/lib/correspondence/mail-secrets-store.ts
 *
 * Same contract as the Stripe store: deploy env wins, the file fills gaps,
 * and only masked hints ever leave the server (L2 — never in chat or tracked MD).
 */
import { join } from "node:path";
import { tenantDataPath } from "../tenant.js";
import {
  hydrateEnvFromFile,
  maskSecret,
  readEnvFile,
  writeEnvFile,
} from "../secrets/env-file-store.js";
import { getImapEnvPath } from "./paths.js";

export const MAIL_ENV_KEYS = [
  "ORGOS_SMTP_HOST",
  "ORGOS_SMTP_PORT",
  "ORGOS_SMTP_USER",
  "ORGOS_SMTP_PASSWORD",
  "ORGOS_IMAP_HOST",
  "ORGOS_IMAP_PORT",
  "ORGOS_IMAP_USER",
  "ORGOS_IMAP_PASSWORD",
  "ORGOS_WIRE_SMTP_USER",
  "ORGOS_WIRE_SMTP_PASSWORD",
] as const;

export type MailEnvKey = (typeof MAIL_ENV_KEYS)[number];

export type MailSecretsInput = Partial<Record<MailEnvKey, string>>;

export type MailSecretsSnapshot = {
  storage_path: string;
  smtp_user_configured: boolean;
  smtp_password_configured: boolean;
  smtp_user_hint: string | null;
  imap_user_configured: boolean;
  imap_password_configured: boolean;
  imap_user_hint: string | null;
  wire_smtp_password_configured: boolean;
};

const SECRET_KEYS: ReadonlySet<string> = new Set([
  "ORGOS_SMTP_PASSWORD",
  "ORGOS_IMAP_PASSWORD",
  "ORGOS_WIRE_SMTP_PASSWORD",
]);

const HEADER = [
  "# OrgOS mail secrets — gitignored · set via Operator Console or CLI",
  "# Never commit this file.",
] as const;

let hydrated = false;

export function mailSecretsFilePath(): string {
  return join(tenantDataPath("secrets"), "mail-secrets.env");
}

export function loadMailSecretsFromFile(): Record<string, string> {
  const legacy = readEnvFile(getImapEnvPath());
  return { ...legacy, ...readEnvFile(mailSecretsFilePath()) };
}

/** Env vars from deploy win; store fills gaps (Console-saved secrets). */
export function hydrateMailEnvFromStore(): void {
  if (hydrated) return;
  hydrated = true;
  hydrateEnvFromFile(getImapEnvPath(), MAIL_ENV_KEYS);
  hydrateEnvFromFile(mailSecretsFilePath(), MAIL_ENV_KEYS);
}

export function resetMailSecretsHydrationForTest(): void {
  hydrated = false;
}

export function saveMailSecrets(input: MailSecretsInput): Record<string, string> {
  const merged: Record<string, string> = { ...readEnvFile(mailSecretsFilePath()) };
  for (const key of MAIL_ENV_KEYS) {
    const raw = input[key];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (!value) continue;
    merged[key] = value;
    process.env[key] = value;
  }
  writeEnvFile(mailSecretsFilePath(), MAIL_ENV_KEYS, merged, HEADER);
  hydrated = true;
  return merged;
}

/** Booleans and masked hints only — no secret values. */
export function buildMailSecretsSnapshot(): MailSecretsSnapshot {
  hydrateMailEnvFromStore();
  const value = (key: MailEnvKey) => process.env[key]?.trim() ?? "";
  const smtpUser = value("ORGOS_SMTP_USER");
  const imapUser = value("ORGOS_IMAP_USER") || smtpUser;
  return {
    storage_path: "data/secrets/mail-secrets.env",
    smtp_user_configured: Boolean(smtpUser),
    smtp_password_configured: Boolean(value("ORGOS_SMTP_PASSWORD")),
    smtp_user_hint: smtpUser ? maskSecret(smtpUser) : null,
    imap_user_configured: Boolean(imapUser),
    imap_password_configured: Boolean(
      value("ORGOS_IMAP_PASSWORD") || value("ORGOS_SMTP_PASSWORD"),
    ),
    imap_user_hint: imapUser ? maskSecret(imapUser) : null,
    wire_smtp_password_configured: Boolean(
      value("ORGOS_WIRE_SMTP_PASSWORD") || value("ORGOS_SMTP_PASSWORD"),
    ),
  };
}

export function isMailSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key);
}
