/**
 * Connector fallback secrets (Slack webhook, Asana PAT).
 * Path: src/lib/integrations/connector-secrets-store.ts
 *
 * Same contract as the mail secrets store: deploy env wins, the gitignored file
 * fills gaps, and only masked hints ever leave the server. Values are write-only
 * — there is deliberately no read API (L2).
 */
import { join } from "node:path";
import { tenantDataPath } from "../tenant.js";
import {
  hydrateEnvFromFile,
  maskSecret,
  readEnvFile,
  writeEnvFile,
} from "../secrets/env-file-store.js";

export const CONNECTOR_ENV_KEYS = ["ORGOS_SLACK_WEBHOOK_URL", "ORGOS_ASANA_PAT"] as const;

export type ConnectorEnvKey = (typeof CONNECTOR_ENV_KEYS)[number];

export type ConnectorSecretsInput = Partial<Record<ConnectorEnvKey, string>>;

export interface ConnectorSecretsSnapshot {
  storage_path: string;
  slack_webhook_configured: boolean;
  slack_webhook_hint: string | null;
  asana_pat_configured: boolean;
  asana_pat_hint: string | null;
}

const HEADER = [
  "# OrgOS connector secrets — gitignored · set via Operator Console or CLI",
  "# Never commit this file.",
] as const;

let hydrated = false;

export function connectorSecretsFilePath(): string {
  return join(tenantDataPath("secrets"), "connector-secrets.env");
}

export function hydrateConnectorEnvFromStore(): void {
  if (hydrated) return;
  hydrated = true;
  hydrateEnvFromFile(connectorSecretsFilePath(), CONNECTOR_ENV_KEYS);
}

export function resetConnectorSecretsHydrationForTest(): void {
  hydrated = false;
}

export function saveConnectorSecrets(input: ConnectorSecretsInput): Record<string, string> {
  const merged: Record<string, string> = { ...readEnvFile(connectorSecretsFilePath()) };
  for (const key of CONNECTOR_ENV_KEYS) {
    const raw = input[key];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (!value) continue;
    merged[key] = value;
    process.env[key] = value;
  }
  writeEnvFile(connectorSecretsFilePath(), CONNECTOR_ENV_KEYS, merged, HEADER);
  hydrated = true;
  return merged;
}

export function buildConnectorSecretsSnapshot(): ConnectorSecretsSnapshot {
  hydrateConnectorEnvFromStore();
  const webhook = process.env.ORGOS_SLACK_WEBHOOK_URL?.trim() ?? "";
  const pat = process.env.ORGOS_ASANA_PAT?.trim() ?? "";
  return {
    storage_path: "data/secrets/connector-secrets.env",
    slack_webhook_configured: Boolean(webhook),
    slack_webhook_hint: webhook ? maskSecret(webhook) : null,
    asana_pat_configured: Boolean(pat),
    asana_pat_hint: pat ? maskSecret(pat) : null,
  };
}
