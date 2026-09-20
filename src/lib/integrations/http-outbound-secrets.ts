/**
 * Direct HTTP outbound secrets (Bearer / Basic / OAuth2 client credentials).
 * Path: src/lib/integrations/http-outbound-secrets.ts
 * ADR: docs/adr/0071-direct-http-outbound-connectors.md
 *
 * Write-only — never expose raw values via GET API.
 */
import { join } from "node:path";
import { tenantDataPath } from "../tenant.js";
import {
  hydrateEnvFromFile,
  maskSecret,
  readEnvFile,
  writeEnvFile,
} from "../secrets/env-file-store.js";

export const HTTP_OUTBOUND_ENV_KEYS = [
  "ORGOS_HTTP_OUTBOUND_BEARER",
  "ORGOS_HTTP_OUTBOUND_BASIC_USER",
  "ORGOS_HTTP_OUTBOUND_BASIC_PASSWORD",
  "ORGOS_HTTP_OUTBOUND_CLIENT_ID",
  "ORGOS_HTTP_OUTBOUND_CLIENT_SECRET",
] as const;

export type HttpOutboundEnvKey = (typeof HTTP_OUTBOUND_ENV_KEYS)[number];

export type HttpOutboundSecretsInput = Partial<Record<HttpOutboundEnvKey, string>>;

export interface HttpOutboundSecretsSnapshot {
  storage_path: string;
  bearer_configured: boolean;
  bearer_hint: string | null;
  basic_configured: boolean;
  basic_user_hint: string | null;
  oauth2_configured: boolean;
  client_id_hint: string | null;
}

const HEADER = [
  "# OrgOS HTTP outbound secrets — gitignored · Console or CLI only",
  "# Never commit this file. ADR 0071.",
] as const;

let hydrated = false;

export function httpOutboundSecretsFilePath(): string {
  return join(tenantDataPath("secrets"), "http-outbound.env");
}

export function hydrateHttpOutboundEnvFromStore(): void {
  if (hydrated) return;
  hydrated = true;
  hydrateEnvFromFile(httpOutboundSecretsFilePath(), HTTP_OUTBOUND_ENV_KEYS);
}

export function resetHttpOutboundSecretsHydrationForTest(): void {
  hydrated = false;
}

export function saveHttpOutboundSecrets(
  input: HttpOutboundSecretsInput,
): Record<string, string> {
  const merged: Record<string, string> = { ...readEnvFile(httpOutboundSecretsFilePath()) };
  for (const key of HTTP_OUTBOUND_ENV_KEYS) {
    const raw = input[key];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (!value) continue;
    merged[key] = value;
    process.env[key] = value;
  }
  writeEnvFile(httpOutboundSecretsFilePath(), HTTP_OUTBOUND_ENV_KEYS, merged, HEADER);
  hydrated = true;
  return merged;
}

export function buildHttpOutboundSecretsSnapshot(): HttpOutboundSecretsSnapshot {
  hydrateHttpOutboundEnvFromStore();
  const bearer = process.env.ORGOS_HTTP_OUTBOUND_BEARER?.trim() ?? "";
  const basicUser = process.env.ORGOS_HTTP_OUTBOUND_BASIC_USER?.trim() ?? "";
  const basicPass = process.env.ORGOS_HTTP_OUTBOUND_BASIC_PASSWORD?.trim() ?? "";
  const clientId = process.env.ORGOS_HTTP_OUTBOUND_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.ORGOS_HTTP_OUTBOUND_CLIENT_SECRET?.trim() ?? "";
  return {
    storage_path: "data/secrets/http-outbound.env",
    bearer_configured: Boolean(bearer),
    bearer_hint: bearer ? maskSecret(bearer) : null,
    basic_configured: Boolean(basicUser && basicPass),
    basic_user_hint: basicUser ? maskSecret(basicUser) : null,
    oauth2_configured: Boolean(clientId && clientSecret),
    client_id_hint: clientId ? maskSecret(clientId) : null,
  };
}
