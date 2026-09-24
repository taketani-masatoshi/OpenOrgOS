/**
 * National eID endpoint settings (SiVa · digidoc4j sidecar) in a gitignored 0600 env file.
 * Path: src/lib/pdf-esign/esign-secrets-store.ts
 *
 * Same contract as the mail and Stripe stores: deploy env wins, the file fills
 * gaps, and the sidecar token never leaves the server (only a masked hint).
 */
import { join } from "node:path";
import { tenantDataPath } from "../tenant.js";
import {
  hydrateEnvFromFile,
  maskSecret,
  readEnvFile,
  writeEnvFile,
} from "../secrets/env-file-store.js";

export const ESIGN_ENV_KEYS = [
  "ORGOS_SIVA_BASE_URL",
  "ORGOS_SIVA_MODE",
  "ORGOS_DIGIDOC_SIDECAR_URL",
  "ORGOS_DIGIDOC_SIDECAR_TOKEN",
  "ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK",
] as const;

export type EsignEnvKey = (typeof ESIGN_ENV_KEYS)[number];

export type EsignSecretsInput = Partial<Record<EsignEnvKey, string>>;

export type EsignSecretsSnapshot = {
  storage_path: string;
  siva_base_url: string | null;
  siva_mode: string | null;
  sidecar_url: string | null;
  sidecar_token_configured: boolean;
  sidecar_token_hint: string | null;
  allow_http_loopback: boolean;
};

const HEADER = [
  "# OrgOS national eID endpoints — gitignored · set via Operator Console or CLI",
  "# The sidecar token is a secret. Never commit this file.",
] as const;

let hydrated = false;

/** `1/true/yes` ⇒ true, `0/false/no` ⇒ false, anything else ⇒ unset. */
export function parseEnvFlag(raw: string | undefined): boolean | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  return undefined;
}

export function esignSecretsFilePath(): string {
  return join(tenantDataPath("secrets"), "esign-secrets.env");
}

/** Env vars from deploy win; the store fills gaps. */
export function hydrateEsignEnvFromStore(): void {
  if (hydrated) return;
  hydrated = true;
  hydrateEnvFromFile(esignSecretsFilePath(), ESIGN_ENV_KEYS);
}

export function resetEsignSecretsHydrationForTest(): void {
  hydrated = false;
}

export function saveEsignSecrets(input: EsignSecretsInput): void {
  const merged: Record<string, string> = { ...readEnvFile(esignSecretsFilePath()) };
  for (const key of ESIGN_ENV_KEYS) {
    const raw = input[key];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (!value) continue;
    merged[key] = value;
    process.env[key] = value;
  }
  writeEnvFile(esignSecretsFilePath(), ESIGN_ENV_KEYS, merged, HEADER);
  hydrated = true;
}

/** URLs and booleans only — the token is reported as a masked hint. */
export function buildEsignSecretsSnapshot(): EsignSecretsSnapshot {
  hydrateEsignEnvFromStore();
  const value = (key: EsignEnvKey) => process.env[key]?.trim() ?? "";
  const token = value("ORGOS_DIGIDOC_SIDECAR_TOKEN");
  return {
    storage_path: "data/secrets/esign-secrets.env",
    siva_base_url: value("ORGOS_SIVA_BASE_URL") || null,
    siva_mode: value("ORGOS_SIVA_MODE") || null,
    sidecar_url: value("ORGOS_DIGIDOC_SIDECAR_URL") || null,
    sidecar_token_configured: Boolean(token),
    sidecar_token_hint: token ? maskSecret(token) : null,
    allow_http_loopback: parseEnvFlag(process.env.ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK) === true,
  };
}
