/**
 * Connector settings + OAuth token store (Slack / Asana / Gmail / Drive).
 * Path: src/lib/integrations/connector-store.ts
 *
 * OrgOS stays the source of truth: this module only remembers where a replica
 * should go (channel / project / folder) and holds the credential needed to
 * push there. Tokens are written under gitignored records/ (L2) and are never
 * returned to a caller — status snapshots expose booleans and labels only.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  connectorSettingsSchema,
  connectorTokenSchema,
  connectorsFileSchema,
  CONNECTOR_PROVIDERS,
  type ConnectorProvider,
  type ConnectorSettings,
  type ConnectorToken,
  type ConnectorsFile,
} from "../../../schemas/connectors.js";
import { getDataDir, loadRegistryFile, writeYamlFile } from "../utils.js";
import { getTenantRecordsDir } from "../correspondence/paths.js";
import { getGmailOAuthTokenPath, isGmailTokenExpired, loadGmailOAuthToken } from "../correspondence/gmail-oauth.js";

const TOKEN_EXPIRY_SKEW_MS = 60_000;

export function connectorsFilePath(): string {
  return join(getDataDir(), "integrations", "connectors.yaml");
}

export function loadConnectorSettingsFile(): ConnectorsFile {
  return loadRegistryFile(connectorsFilePath(), connectorsFileSchema, () =>
    connectorsFileSchema.parse({ version: 1, connectors: [] }),
  );
}

export function loadConnectorSettings(provider: ConnectorProvider): ConnectorSettings | undefined {
  return loadConnectorSettingsFile().connectors.find((c) => c.provider === provider);
}

export function saveConnectorSettings(
  provider: ConnectorProvider,
  patch: Omit<Partial<ConnectorSettings>, "provider">,
  updatedBy?: string,
): ConnectorSettings {
  const file = loadConnectorSettingsFile();
  const current = file.connectors.find((c) => c.provider === provider);
  const next = connectorSettingsSchema.parse({
    ...(current ?? { provider }),
    ...patch,
    provider,
    updated_at: new Date().toISOString(),
    ...(updatedBy ? { updated_by: updatedBy } : {}),
  });
  const idx = file.connectors.findIndex((c) => c.provider === provider);
  if (idx >= 0) file.connectors[idx] = next;
  else file.connectors.push(next);
  mkdirSync(join(getDataDir(), "integrations"), { recursive: true });
  writeYamlFile(connectorsFilePath(), connectorsFileSchema.parse(file));
  return next;
}

/**
 * Gmail keeps its historical token path so existing CLI and Community flows
 * keep working; the other providers share records/integrations/.
 */
export function connectorTokenPath(provider: ConnectorProvider): string {
  if (provider === "gmail") return getGmailOAuthTokenPath();
  return join(getTenantRecordsDir(), "integrations", `${provider}-oauth.json`);
}

export function loadConnectorToken(provider: ConnectorProvider): ConnectorToken | null {
  if (provider === "gmail") {
    const gmail = loadGmailOAuthToken();
    if (!gmail) return null;
    return connectorTokenSchema.parse({
      provider: "gmail",
      access_token: gmail.access_token,
      refresh_token: gmail.refresh_token,
      token_type: gmail.token_type,
      expiry_date: gmail.expiry_date,
      scope: gmail.scope,
      account_label: gmail.email,
      connected_via: gmail.connected_via ?? "community",
    });
  }
  const path = connectorTokenPath(provider);
  if (!existsSync(path)) return null;
  try {
    return connectorTokenSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return null;
  }
}

export function saveConnectorToken(token: ConnectorToken): ConnectorToken {
  const parsed = connectorTokenSchema.parse({
    ...token,
    connected_at: token.connected_at ?? new Date().toISOString(),
  });
  const path = connectorTokenPath(parsed.provider);
  mkdirSync(join(getTenantRecordsDir(), "integrations"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  return parsed;
}

export function deleteConnectorToken(provider: ConnectorProvider): boolean {
  const path = connectorTokenPath(provider);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

/** Slack bot tokens do not expire; treating them as stale would force re-auth. */
function tokenNeverExpires(provider: ConnectorProvider): boolean {
  return provider === "slack";
}

export function isConnectorTokenExpired(token: ConnectorToken): boolean {
  if (tokenNeverExpires(token.provider)) return false;
  if (!token.expiry_date) return false;
  return Date.now() >= token.expiry_date - TOKEN_EXPIRY_SKEW_MS;
}

export interface ConnectorStatus {
  provider: ConnectorProvider;
  connected: boolean;
  account_label?: string;
  connected_via?: string;
  connected_at?: string;
  expired: boolean;
  /** True when a webhook / PAT fallback is available without OAuth. */
  fallback_configured: boolean;
  settings: {
    default_channel_id?: string;
    default_channel_name?: string;
    default_project_gid?: string;
    default_folder_id?: string;
  };
}

export function readConnectorStatus(
  provider: ConnectorProvider,
  fallbackConfigured = false,
): ConnectorStatus {
  const token = loadConnectorToken(provider);
  const settings = loadConnectorSettings(provider);
  const expired =
    provider === "gmail"
      ? (() => {
          const gmail = loadGmailOAuthToken();
          return gmail ? isGmailTokenExpired(gmail) : false;
        })()
      : token
        ? isConnectorTokenExpired(token)
        : false;
  return {
    provider,
    connected: Boolean(token),
    account_label: token?.account_label,
    connected_via: token?.connected_via,
    connected_at: token?.connected_at,
    expired,
    fallback_configured: fallbackConfigured,
    settings: {
      default_channel_id: settings?.default_channel_id,
      default_channel_name: settings?.default_channel_name,
      default_project_gid: settings?.default_project_gid,
      default_folder_id: settings?.default_folder_id,
    },
  };
}

export function allConnectorProviders(): readonly ConnectorProvider[] {
  return CONNECTOR_PROVIDERS;
}
