/**
 * Direct HTTP / OData outbound connector settings (L1 only).
 * Path: schemas/http-outbound.ts
 * ADR: docs/adr/0071-direct-http-outbound-connectors.md
 *
 * Secrets live in data/secrets/http-outbound.env — never in this YAML.
 */
import { z } from "zod";

export const httpOutboundAuthKindSchema = z.enum([
  "none",
  "bearer",
  "basic",
  "oauth2_client_credentials",
]);

export const httpOutboundDialectSchema = z.enum(["rest", "odata_v4", "odata_v2"]);

export const httpOutboundSourceSchema = z.enum(["finance.monthly", "invoice.issued"]);

export const httpOutboundHttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH"]);

export const httpOutboundRouteSchema = z.object({
  id: z.string().min(1),
  source: httpOutboundSourceSchema,
  method: httpOutboundHttpMethodSchema.default("POST"),
  /** Path relative to base_url. May include `{month}` / `{invoice_id}`. */
  path: z.string().min(1),
  notes: z.string().optional(),
});

export const httpOutboundConfigSchema = z.object({
  version: z.literal(1).default(1),
  /** Tenant feature gate — Community shipping flags are not used (ADR 0071). */
  enabled: z.boolean().default(false),
  base_url: z.string().url().optional(),
  auth_kind: httpOutboundAuthKindSchema.default("none"),
  dialect: httpOutboundDialectSchema.default("rest"),
  /** OAuth2 token endpoint (client_credentials only). */
  token_url: z.string().url().optional(),
  /** Optional OData entity set prefix for odata_v4 (e.g. /odata/v4/Finance). */
  odata_service_path: z.string().optional(),
  routes: z.array(httpOutboundRouteSchema).default([]),
  notes: z.string().optional(),
  updated_at: z.string().optional(),
  updated_by: z.string().optional(),
});

export type HttpOutboundConfig = z.output<typeof httpOutboundConfigSchema>;
export type HttpOutboundRoute = z.output<typeof httpOutboundRouteSchema>;
export type HttpOutboundSource = z.output<typeof httpOutboundSourceSchema>;
export type HttpOutboundDialect = z.output<typeof httpOutboundDialectSchema>;
export type HttpOutboundAuthKind = z.output<typeof httpOutboundAuthKindSchema>;

/** Append-only export ledger (no secrets). */
export const httpExportRecordSchema = z.object({
  id: z.string().min(1),
  source: httpOutboundSourceSchema,
  orgos_id: z.string().min(1),
  route_id: z.string().min(1),
  method: httpOutboundHttpMethodSchema,
  url: z.string().min(1),
  http_status: z.number().int().optional(),
  dry_run: z.boolean().default(false),
  exported_at: z.string().min(1),
  exported_by: z.string().optional(),
  detail: z.string().optional(),
});

export const httpExportsFileSchema = z.object({
  version: z.literal(1).default(1),
  exports: z.array(httpExportRecordSchema).default([]),
});

export type HttpExportRecord = z.output<typeof httpExportRecordSchema>;
export type HttpExportsFile = z.output<typeof httpExportsFileSchema>;
