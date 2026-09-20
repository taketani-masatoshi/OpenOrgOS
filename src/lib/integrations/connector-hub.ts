/**
 * Connector hub snapshot for the Operator Console integrations page.
 * Path: src/lib/integrations/connector-hub.ts
 *
 * Sovereign openDesk ports are listed first. Shipping is still a platform
 * decision (ADR 0004 / 0078): a tenant only reads `platform_ready`.
 * A local verify environment can make a confirmed_live port usable without
 * Community OAuth. Connect stays behind the shipping flag.
 */
import type { ConnectorCapability, ConnectorClass, ConnectorInclusion, ConnectorProvider } from "../../../schemas/connectors.js";
import { catalogEntry, orderedConnectorProviders } from "./connector-catalog.js";
import { loadCommunityIntegration } from "../protocol/eco-production-evidence.js";
import { communityConnectionsUrl } from "../protocol/community-gmail-bind.js";
import { effectiveOxInclusion, loadProbeResult } from "./opendesk-probe.js";
import { buildConnectorSecretsSnapshot, type ConnectorSecretsSnapshot } from "./connector-secrets-store.js";
import { readConnectorStatus, type ConnectorStatus } from "./connector-store.js";

export interface ConnectorPlatformReadiness {
  ready: boolean;
  detail: string;
}

export function sovereignLocalConfigured(
  provider: ConnectorProvider,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (provider === "matrix") {
    const base = Boolean(env.ORGOS_MATRIX_BASE_URL?.trim());
    const auth = Boolean(env.ORGOS_MATRIX_ACCESS_TOKEN?.trim() || env.ORGOS_MATRIX_PASSWORD?.trim());
    return base && auth;
  }
  if (provider === "nextcloud") {
    return Boolean(
      env.ORGOS_NEXTCLOUD_BASE_URL?.trim() &&
        env.ORGOS_NEXTCLOUD_USER?.trim() &&
        env.ORGOS_NEXTCLOUD_APP_PASSWORD?.trim(),
    );
  }
  if (provider === "keycloak") return Boolean(env.ORGOS_KEYCLOAK_BASE_URL?.trim());
  if (provider === "ox") {
    return effectiveOxInclusion(loadProbeResult()) === "confirmed_live" && Boolean(env.ORGOS_OX_BASE_URL?.trim());
  }
  return false;
}

/** Console wording. Flag-off and stubs must not read as success. */
export function connectorStatusLabel(
  card: Pick<
    ConnectorCard,
    "inclusion" | "platform_ready" | "usable" | "connected" | "expired" | "fallback_configured"
  >,
): string {
  if (card.inclusion === "stub_unconfirmed") return "未出荷（スタブ・外へは出しません）";
  if (!card.platform_ready) return "未出荷（接続は閉じています）";
  if (card.inclusion === "confirmed_live" && card.usable) return "疎通確認済み";
  if (card.connected && card.expired) return "接続済み（期限切れ）";
  if (card.connected) return "接続済み";
  if (card.fallback_configured) return "簡易接続（webhook / PAT）";
  return "未接続";
}

export function connectorPlatformReadiness(
  provider: ConnectorProvider,
): ConnectorPlatformReadiness {
  const entry = catalogEntry(provider);
  const shipped = loadCommunityIntegration()?.[entry.shippingFlag] === true;
  if (shipped) {
    return { ready: true, detail: `Community ${entry.label} connect shipped` };
  }
  return {
    ready: false,
    detail: `${entry.label} 連携は運営側が未出荷です。出荷後に接続できます。`,
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
  connector_class: ConnectorClass;
  capability: ConnectorCapability;
  inclusion: ConnectorInclusion;
  platform_ready: boolean;
  platform_detail: string;
  /** True when the console can act (send / push / upload) right now. */
  usable: boolean;
  /** Server wording. Flag-off and stubs are never success. */
  status_label: string;
}

export function buildConnectorCard(
  provider: ConnectorProvider,
  oxInclusion?: ConnectorInclusion,
): ConnectorCard {
  const entry = catalogEntry(provider);
  const platform = connectorPlatformReadiness(provider);
  const status = readConnectorStatus(provider, fallbackConfigured(provider));
  const inclusion = provider === "ox" ? (oxInclusion ?? effectiveOxInclusion(loadProbeResult())) : entry.inclusion;
  const localReady = inclusion === "confirmed_live" && sovereignLocalConfigured(provider);
  const usable = (status.connected && !status.expired) || status.fallback_configured || localReady;
  const card = {
    inclusion,
    platform_ready: platform.ready,
    usable,
    connected: status.connected,
    expired: status.expired,
    fallback_configured: status.fallback_configured,
  };
  return {
    ...status,
    label: entry.label,
    connector_class: entry.connectorClass,
    capability: entry.capability,
    inclusion,
    platform_ready: platform.ready,
    platform_detail: platform.detail,
    usable,
    status_label: connectorStatusLabel(card),
  };
}

export interface ConnectorHubSnapshot {
  connectors: ConnectorCard[];
  secrets: ConnectorSecretsSnapshot;
  community_connections_url: string;
}

export function buildConnectorHubSnapshot(): ConnectorHubSnapshot {
  const oxInclusion = effectiveOxInclusion(loadProbeResult());
  return {
    connectors: orderedConnectorProviders().map((provider) => buildConnectorCard(provider, oxInclusion)),
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
