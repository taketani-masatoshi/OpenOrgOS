/**
 * Connector hub snapshot for the Operator Console integrations page.
 * Path: src/lib/integrations/connector-hub.ts
 *
 * One place answers "what is connected, what can be connected, and what is
 * still waiting on the platform". Shipping is a platform decision (ADR 0004),
 * so a tenant only ever reads `platform_ready` — it cannot flip it.
 */
import type { ConnectorProvider } from "../../../schemas/connectors.js";
import { CONNECTOR_PROVIDERS } from "../../../schemas/connectors.js";
import {
  loadCommunityIntegration,
  type CommunityIntegrationStatus,
} from "../protocol/eco-production-evidence.js";
import { communityConnectionsUrl } from "../protocol/community-gmail-bind.js";
import { buildConnectorSecretsSnapshot, type ConnectorSecretsSnapshot } from "./connector-secrets-store.js";
import { readConnectorStatus, type ConnectorStatus } from "./connector-store.js";

/** Community flag that gates each provider's connect flow. */
const PROVIDER_SHIPPING_FLAG: Record<ConnectorProvider, keyof CommunityIntegrationStatus> = {
  gmail: "tenant_mail_connect_api",
  slack: "connector_slack",
  asana: "connector_asana",
  gdrive: "connector_gdrive",
};

const PROVIDER_LABEL: Record<ConnectorProvider, string> = {
  gmail: "Gmail",
  slack: "Slack",
  asana: "Asana",
  gdrive: "Google Drive",
};

export interface ConnectorPlatformReadiness {
  ready: boolean;
  detail: string;
}

export function connectorPlatformReadiness(
  provider: ConnectorProvider,
): ConnectorPlatformReadiness {
  const flag = PROVIDER_SHIPPING_FLAG[provider];
  const shipped = loadCommunityIntegration()?.[flag] === true;
  return {
    ready: shipped,
    detail: shipped
      ? `Community ${PROVIDER_LABEL[provider]} connect shipped`
      : `${PROVIDER_LABEL[provider]} 連携は運営側が未出荷です。出荷後に接続できます。`,
  };
}

/** Whether the provider works without OAuth (webhook / PAT fallback). */
function fallbackConfigured(provider: ConnectorProvider): boolean {
  const secrets = buildConnectorSecretsSnapshot();
  if (provider === "slack") return secrets.slack_webhook_configured;
  if (provider === "asana") return secrets.asana_pat_configured;
  return false;
}

export interface ConnectorCard extends ConnectorStatus {
  label: string;
  platform_ready: boolean;
  platform_detail: string;
  /** True when the console can act (send / push / upload) right now. */
  usable: boolean;
}

export function buildConnectorCard(provider: ConnectorProvider): ConnectorCard {
  const platform = connectorPlatformReadiness(provider);
  const status = readConnectorStatus(provider, fallbackConfigured(provider));
  return {
    ...status,
    label: PROVIDER_LABEL[provider],
    platform_ready: platform.ready,
    platform_detail: platform.detail,
    usable: (status.connected && !status.expired) || status.fallback_configured,
  };
}

export interface ConnectorHubSnapshot {
  connectors: ConnectorCard[];
  secrets: ConnectorSecretsSnapshot;
  community_connections_url: string;
}

export function buildConnectorHubSnapshot(): ConnectorHubSnapshot {
  return {
    connectors: CONNECTOR_PROVIDERS.map(buildConnectorCard),
    secrets: buildConnectorSecretsSnapshot(),
    community_connections_url: communityConnectionsUrl(),
  };
}

/** Guard used before any outbound call — never let the console fake a connection. */
export function assertConnectorUsable(provider: ConnectorProvider): void {
  const card = buildConnectorCard(provider);
  if (card.usable) return;
  if (!card.platform_ready) throw new Error(card.platform_detail);
  throw new Error(`${card.label} が未接続です。連携設定から接続してください。`);
}
