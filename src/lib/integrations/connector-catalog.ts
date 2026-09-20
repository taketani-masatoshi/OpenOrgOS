/**
 * Connector catalog — class, capability, inclusion, shipping flag.
 * Path: src/lib/integrations/connector-catalog.ts
 *
 * ADR 0078. OpenDesk ports are sovereign. Slack / Google / Microsoft 365
 * are compat egress: L1 copies, not a second source of truth.
 */
import {
  CONNECTOR_PROVIDERS,
  type ConnectorCapability,
  type ConnectorClass,
  type ConnectorInclusion,
  type ConnectorProvider,
} from "../../../schemas/connectors.js";
import type { CommunityIntegrationStatus } from "../protocol/eco-production-evidence.js";

export type ConnectorShippingFlag = keyof CommunityIntegrationStatus;

export interface ConnectorCatalogEntry {
  provider: ConnectorProvider;
  label: string;
  connectorClass: ConnectorClass;
  capability: ConnectorCapability;
  /** Static default. OX may be promoted by a probe result. */
  inclusion: ConnectorInclusion;
  shippingFlag: ConnectorShippingFlag;
  /** Public image used by deploy/opendesk-verify when inclusion is confirmed_live. */
  verifyImage?: string;
}

const CATALOG: readonly ConnectorCatalogEntry[] = [
  {
    provider: "matrix",
    label: "Matrix",
    connectorClass: "sovereign",
    capability: "chat",
    inclusion: "confirmed_live",
    shippingFlag: "connector_matrix",
    verifyImage: "matrixdotorg/synapse:v1.161.0",
  },
  {
    provider: "nextcloud",
    label: "Nextcloud",
    connectorClass: "sovereign",
    capability: "files",
    inclusion: "confirmed_live",
    shippingFlag: "connector_nextcloud",
    verifyImage: "nextcloud:34.0.4",
  },
  {
    provider: "ox",
    label: "Open-Xchange",
    connectorClass: "sovereign",
    capability: "mail",
    inclusion: "stub_unconfirmed",
    shippingFlag: "connector_ox",
  },
  {
    provider: "keycloak",
    label: "Keycloak",
    connectorClass: "sovereign",
    capability: "iam",
    inclusion: "confirmed_live",
    shippingFlag: "connector_keycloak",
    verifyImage: "quay.io/keycloak/keycloak:26.3.5",
  },
  {
    provider: "gmail",
    label: "Gmail",
    connectorClass: "compat",
    capability: "mail",
    inclusion: "compat_egress",
    shippingFlag: "tenant_mail_connect_api",
  },
  {
    provider: "slack",
    label: "Slack",
    connectorClass: "compat",
    capability: "chat",
    inclusion: "compat_egress",
    shippingFlag: "connector_slack",
  },
  {
    provider: "asana",
    label: "Asana",
    connectorClass: "compat",
    capability: "tasks",
    inclusion: "compat_egress",
    shippingFlag: "connector_asana",
  },
  {
    provider: "gdrive",
    label: "Google Drive",
    connectorClass: "compat",
    capability: "files",
    inclusion: "compat_egress",
    shippingFlag: "connector_gdrive",
  },
  {
    provider: "m365",
    label: "Microsoft 365",
    connectorClass: "compat",
    capability: "mail",
    inclusion: "compat_egress",
    shippingFlag: "connector_m365",
  },
];

const BY_PROVIDER = new Map(CATALOG.map((entry) => [entry.provider, entry]));

export function connectorCatalog(): readonly ConnectorCatalogEntry[] {
  return CATALOG;
}

export function catalogEntry(provider: ConnectorProvider): ConnectorCatalogEntry {
  const entry = BY_PROVIDER.get(provider);
  if (!entry) throw new Error(`unknown connector provider: ${provider}`);
  return entry;
}

export function connectorsInClass(connectorClass: ConnectorClass): ConnectorCatalogEntry[] {
  return CATALOG.filter((entry) => entry.connectorClass === connectorClass);
}

/** Display order: sovereign, then compat. Matches CONNECTOR_PROVIDERS. */
export function orderedConnectorProviders(): readonly ConnectorProvider[] {
  return CONNECTOR_PROVIDERS;
}
