/**
 * Console SaaS connectors (Slack / Asana / Gmail / Google Drive).
 * Path: schemas/connectors.ts
 *
 * The tenant YAML holds routing preferences only — channel, project and folder
 * ids are L1. OAuth tokens live in gitignored records/ and never appear here.
 */
import { z } from "zod";

export const CONNECTOR_PROVIDERS = ["gmail", "slack", "asana", "gdrive"] as const;

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
  connected_via: z.enum(["cli", "community"]).default("community"),
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
  /** Google Drive: folder that receives generated PDFs. */
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
