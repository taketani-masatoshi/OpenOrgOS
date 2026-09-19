/**
 * Console connectors — openDesk sovereign ports and compat egress.
 * Path: schemas/connectors.ts
 *
 * The tenant YAML holds routing preferences only — channel, project and folder
 * ids are L1. OAuth tokens live in gitignored records/ and never appear here.
 * ADR 0078: Matrix / Nextcloud / OX / Keycloak are the office-suite ports.
 * Slack / Gmail / Drive / Asana / Microsoft 365 stay as L1 replicas.
 */
import { z } from "zod";

export const CONNECTOR_CLASSES = ["sovereign", "compat"] as const;
export const connectorClassSchema = z.enum(CONNECTOR_CLASSES);
export type ConnectorClass = z.output<typeof connectorClassSchema>;

export const CONNECTOR_CAPABILITIES = [
  "chat",
  "files",
  "mail",
  "calendar",
  "tasks",
  "iam",
] as const;
export const connectorCapabilitySchema = z.enum(CONNECTOR_CAPABILITIES);
export type ConnectorCapability = z.output<typeof connectorCapabilitySchema>;

/** confirmed_live = public OSS image we can run. stub_unconfirmed = not yet. */
export const CONNECTOR_INCLUSIONS = [
  "confirmed_live",
  "stub_unconfirmed",
  "compat_egress",
] as const;
export const connectorInclusionSchema = z.enum(CONNECTOR_INCLUSIONS);
export type ConnectorInclusion = z.output<typeof connectorInclusionSchema>;

/** Sovereign first, then compat egress. Existing four providers stay. */
export const CONNECTOR_PROVIDERS = [
  "matrix",
  "nextcloud",
  "ox",
  "keycloak",
  "gmail",
  "slack",
  "asana",
  "gdrive",
  "m365",
] as const;

export const connectorProviderSchema = z.enum(CONNECTOR_PROVIDERS);

export type ConnectorProvider = z.output<typeof connectorProviderSchema>;

/** OAuth token as stored per provider in records/integrations/{provider}-oauth.json. */
export const connectorTokenSchema = z.object({
  version: z.literal(1).default(1),
  provider: connectorProviderSchema,
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_type: z.string().default("Bearer"),
  expiry_date: z.number().int().optional(),
  scope: z.string().optional(),
  /** Human-recognisable account label (workspace name, email, org). */
  account_label: z.string().optional(),
  /** External workspace / team id (Slack team, Asana workspace, Google sub). */
  account_id: z.string().optional(),
  connected_via: z.enum(["cli", "community", "local"]).default("community"),
  connected_at: z.string().optional(),
});

export type ConnectorToken = z.output<typeof connectorTokenSchema>;

export const connectorSettingsSchema = z.object({
  provider: connectorProviderSchema,
  /** Slack: default channel id the console posts to. */
  default_channel_id: z.string().optional(),
  default_channel_name: z.string().optional(),
  /** Asana: project the console pushes work orders / executive tasks into. */
  default_project_gid: z.string().optional(),
  /** Google Drive / Nextcloud: folder that receives generated copies. */
  default_folder_id: z.string().optional(),
  notes: z.string().optional(),
  updated_at: z.string().optional(),
  updated_by: z.string().optional(),
});

export type ConnectorSettings = z.output<typeof connectorSettingsSchema>;

export const connectorsFileSchema = z.object({
  version: z.literal(1).default(1),
  connectors: z.array(connectorSettingsSchema).default([]),
});

export type ConnectorsFile = z.output<typeof connectorsFileSchema>;
