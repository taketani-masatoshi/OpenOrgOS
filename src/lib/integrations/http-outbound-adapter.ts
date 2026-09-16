/**
 * Direct HTTP / OData outbound adapter — finance L1 replica only.
 * Path: src/lib/integrations/http-outbound-adapter.ts
 * ADR: docs/adr/0071-direct-http-outbound-connectors.md
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  httpExportsFileSchema,
  httpOutboundConfigSchema,
  type HttpExportRecord,
  type HttpExportsFile,
  type HttpOutboundConfig,
  type HttpOutboundRoute,
  type HttpOutboundSource,
} from "../../../schemas/http-outbound.js";
import { loadMonthlyFinance } from "../data.js";
import { listTransactions } from "../protocol/transactions.js";
import { getDataDir, loadRegistryFile, writeYamlFile } from "../utils.js";
import {
  buildHttpOutboundSecretsSnapshot,
  hydrateHttpOutboundEnvFromStore,
} from "./http-outbound-secrets.js";

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "account_number",
  "bank_account",
  "bank_account_number",
  "iban",
  "routing_number",
  "wifi_password",
  "password",
  "secret",
  "address",
  "personal_address",
  "phone",
  "mobile",
  "stakeholder_detail",
]);

export type HttpOutboundExportKind = "monthly" | "invoice";

export interface HttpOutboundStatus {
  enabled: boolean;
  configured: boolean;
  usable: boolean;
  base_url: string | null;
  auth_kind: HttpOutboundConfig["auth_kind"];
  dialect: HttpOutboundConfig["dialect"];
  route_count: number;
  export_count: number;
  secrets: ReturnType<typeof buildHttpOutboundSecretsSnapshot>;
  detail: string;
}

export interface HttpOutboundExportResult {
  ok: boolean;
  dry_run: boolean;
  reason: string;
  http_status?: number;
  url?: string;
  payload?: Record<string, unknown>;
  export_id?: string;
}

function configPath(): string {
  return join(getDataDir(), "integrations", "http-outbound.yaml");
}

function exportsPath(): string {
  return join(getDataDir(), "integrations", "http-exports.yaml");
}

export function loadHttpOutboundConfig(): HttpOutboundConfig {
  return loadRegistryFile(configPath(), httpOutboundConfigSchema, () =>
    httpOutboundConfigSchema.parse({ version: 1, enabled: false, routes: [] }),
  );
}

export function saveHttpOutboundConfig(
  patch: Partial<HttpOutboundConfig>,
  updatedBy?: string,
): HttpOutboundConfig {
  const current = loadHttpOutboundConfig();
  const next = httpOutboundConfigSchema.parse({
    ...current,
    ...patch,
    version: 1,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? current.updated_by,
  });
  if (next.dialect === "odata_v2") {
    throw new Error("odata_v2 is not implemented in this MVP — use rest or odata_v4");
  }
  mkdirSync(join(getDataDir(), "integrations"), { recursive: true });
  writeYamlFile(configPath(), next);
  return next;
}

export function loadHttpExports(): HttpExportsFile {
  return loadRegistryFile(exportsPath(), httpExportsFileSchema, () =>
    httpExportsFileSchema.parse({ version: 1, exports: [] }),
  );
}

export function appendHttpExport(record: HttpExportRecord): void {
  const file = loadHttpExports();
  file.exports.push(record);
  mkdirSync(join(getDataDir(), "integrations"), { recursive: true });
  writeYamlFile(exportsPath(), httpExportsFileSchema.parse(file));
}

export function httpOutboundStatus(): HttpOutboundStatus {
  const config = loadHttpOutboundConfig();
  const secrets = buildHttpOutboundSecretsSnapshot();
  const exports = loadHttpExports();
  const hasUrl = Boolean(config.base_url?.trim());
  const authOk = authConfigured(config, secrets);
  const usable = config.enabled && hasUrl && authOk && config.routes.length > 0;
  return {
    enabled: config.enabled,
    configured: hasUrl && config.routes.length > 0,
    usable,
    base_url: config.base_url ?? null,
    auth_kind: config.auth_kind,
    dialect: config.dialect,
    route_count: config.routes.length,
    export_count: exports.exports.length,
    secrets,
    detail: usable
      ? "ready"
      : !config.enabled
        ? "disabled — set enabled: true in http-outbound.yaml"
        : !hasUrl
          ? "base_url missing"
          : !authOk
            ? `auth ${config.auth_kind} credentials missing`
            : "no routes configured",
  };
}

function authConfigured(
  config: HttpOutboundConfig,
  secrets: ReturnType<typeof buildHttpOutboundSecretsSnapshot>,
): boolean {
  switch (config.auth_kind) {
    case "none":
      return true;
    case "bearer":
      return secrets.bearer_configured;
    case "basic":
      return secrets.basic_configured;
    case "oauth2_client_credentials":
      return secrets.oauth2_configured && Boolean(config.token_url?.trim());
    default:
      return false;
  }
}

/** Strip forbidden L2 keys recursively. Throws if a forbidden key is present. */
export function assertL1Payload(value: unknown, path = "$"): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertL1Payload(item, `${path}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_PAYLOAD_KEYS.has(lower) || lower.includes("account_number")) {
      throw new Error(`L2 field rejected at ${path}.${key}`);
    }
    assertL1Payload(child, `${path}.${key}`);
  }
}

export function buildMonthlyFinancePayload(month: string): {
  source: HttpOutboundSource;
  orgos_id: string;
  payload: Record<string, unknown>;
} {
  const monthly = loadMonthlyFinance(month);
  if (!monthly) {
    throw new Error(`Monthly finance not found: ${month}`);
  }
  const payload = {
    source: "finance.monthly" as const,
    month: monthly.month,
    basis: monthly.basis,
    revenue: monthly.revenue.map((r) => ({
      property_id: r.property_id,
      category: r.category,
      amount: r.amount,
    })),
    expenses: monthly.expenses.map((e) => ({
      property_id: e.property_id,
      category: e.category,
      chart_account_code: e.chart_account_code,
      amount: e.amount,
    })),
  };
  assertL1Payload(payload);
  return { source: "finance.monthly", orgos_id: month, payload };
}

export function buildInvoiceIssuedPayload(invoiceId: string): {
  source: HttpOutboundSource;
  orgos_id: string;
  payload: Record<string, unknown>;
} {
  const tx = listTransactions().find(
    (t) =>
      t.refs.invoice_id === invoiceId &&
      (t.transaction_type === "steward.invoice.issued" ||
        String(t.transaction_type).includes("invoice.issued")),
  );
  if (!tx) {
    throw new Error(`Invoice transaction not found: ${invoiceId}`);
  }
  const payload = {
    source: "invoice.issued" as const,
    invoice_id: invoiceId,
    transaction_id: tx.transaction_id,
    event_id: tx.event_id,
    amount: tx.amount
      ? { value: tx.amount.value, currency: tx.amount.currency }
      : undefined,
    counterparty_org_id: tx.counterparty.org_id,
    recorded_at: tx.recorded_at,
  };
  assertL1Payload(payload);
  return { source: "invoice.issued", orgos_id: invoiceId, payload };
}

function resolveRoute(
  config: HttpOutboundConfig,
  source: HttpOutboundSource,
): HttpOutboundRoute {
  const route = config.routes.find((r) => r.source === source);
  if (!route) {
    throw new Error(`No route configured for source ${source}`);
  }
  return route;
}

function expandPath(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/gi, (_, key: string) => {
    const value = vars[key];
    if (value === undefined) {
      throw new Error(`Path template missing variable {${key}}`);
    }
    return encodeURIComponent(value);
  });
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function resolveAuthHeaders(
  config: HttpOutboundConfig,
  fetchImpl: typeof fetch,
): Promise<Record<string, string>> {
  hydrateHttpOutboundEnvFromStore();
  switch (config.auth_kind) {
    case "none":
      return {};
    case "bearer": {
      const token = process.env.ORGOS_HTTP_OUTBOUND_BEARER?.trim();
      if (!token) throw new Error("ORGOS_HTTP_OUTBOUND_BEARER missing");
      return { Authorization: `Bearer ${token}` };
    }
    case "basic": {
      const user = process.env.ORGOS_HTTP_OUTBOUND_BASIC_USER?.trim();
      const pass = process.env.ORGOS_HTTP_OUTBOUND_BASIC_PASSWORD?.trim();
      if (!user || !pass) throw new Error("HTTP outbound basic credentials missing");
      const encoded = Buffer.from(`${user}:${pass}`).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
    case "oauth2_client_credentials": {
      const tokenUrl = config.token_url?.trim();
      if (!tokenUrl) throw new Error("token_url required for oauth2_client_credentials");
      const clientId = process.env.ORGOS_HTTP_OUTBOUND_CLIENT_ID?.trim();
      const clientSecret = process.env.ORGOS_HTTP_OUTBOUND_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) {
        throw new Error("OAuth2 client_id / client_secret missing");
      }
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      });
      const res = await fetchImpl(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        throw new Error(`oauth2 token HTTP ${res.status}`);
      }
      const json = (await res.json()) as { access_token?: string };
      if (!json.access_token) throw new Error("oauth2 token response missing access_token");
      return { Authorization: `Bearer ${json.access_token}` };
    }
    default:
      return {};
  }
}

function contentTypeForDialect(dialect: HttpOutboundConfig["dialect"]): string {
  if (dialect === "odata_v4") return "application/json;odata.metadata=minimal";
  return "application/json; charset=utf-8";
}

export async function exportHttpOutbound(opts: {
  kind: HttpOutboundExportKind;
  id: string;
  dryRun?: boolean;
  operatorId?: string;
  fetchImpl?: typeof fetch;
}): Promise<HttpOutboundExportResult> {
  const config = loadHttpOutboundConfig();
  if (config.dialect === "odata_v2") {
    return {
      ok: false,
      dry_run: Boolean(opts.dryRun),
      reason: "odata_v2 is not implemented — use rest or odata_v4",
    };
  }
  if (!config.enabled) {
    return { ok: false, dry_run: Boolean(opts.dryRun), reason: "http outbound disabled" };
  }
  if (!config.base_url?.trim()) {
    return { ok: false, dry_run: Boolean(opts.dryRun), reason: "base_url not configured" };
  }

  const built =
    opts.kind === "monthly"
      ? buildMonthlyFinancePayload(opts.id)
      : buildInvoiceIssuedPayload(opts.id);
  const route = resolveRoute(config, built.source);
  const pathVars =
    opts.kind === "monthly"
      ? { month: opts.id, invoice_id: opts.id }
      : { invoice_id: opts.id, month: opts.id };
  const path = expandPath(route.path, pathVars);
  const servicePrefix =
    config.dialect === "odata_v4" && config.odata_service_path
      ? config.odata_service_path.replace(/\/+$/, "")
      : "";
  const url = joinUrl(config.base_url, `${servicePrefix}${path}`);
  const dryRun = opts.dryRun === true;
  const fetchImpl = opts.fetchImpl ?? fetch;

  if (dryRun) {
    const exportId = `HTTP-EXP-DRY-${Date.now()}`;
    appendHttpExport({
      id: exportId,
      source: built.source,
      orgos_id: built.orgos_id,
      route_id: route.id,
      method: route.method,
      url,
      dry_run: true,
      exported_at: new Date().toISOString(),
      exported_by: opts.operatorId,
      detail: "dry_run — fetch skipped",
    });
    return {
      ok: true,
      dry_run: true,
      reason: "dry_run",
      url,
      payload: built.payload,
      export_id: exportId,
    };
  }

  try {
    const authHeaders = await resolveAuthHeaders(config, fetchImpl);
    const res = await fetchImpl(url, {
      method: route.method,
      headers: {
        "Content-Type": contentTypeForDialect(config.dialect),
        Accept: "application/json",
        ...authHeaders,
      },
      body: route.method === "GET" ? undefined : JSON.stringify(built.payload),
    });
    const exportId = `HTTP-EXP-${Date.now()}`;
    appendHttpExport({
      id: exportId,
      source: built.source,
      orgos_id: built.orgos_id,
      route_id: route.id,
      method: route.method,
      url,
      http_status: res.status,
      dry_run: false,
      exported_at: new Date().toISOString(),
      exported_by: opts.operatorId,
      detail: res.ok ? "ok" : `HTTP ${res.status}`,
    });
    if (!res.ok) {
      return {
        ok: false,
        dry_run: false,
        reason: `HTTP ${res.status}`,
        http_status: res.status,
        url,
        payload: built.payload,
        export_id: exportId,
      };
    }
    return {
      ok: true,
      dry_run: false,
      reason: "ok",
      http_status: res.status,
      url,
      payload: built.payload,
      export_id: exportId,
    };
  } catch (err) {
    return {
      ok: false,
      dry_run: false,
      reason: err instanceof Error ? err.message : String(err),
      url,
      payload: built.payload,
    };
  }
}

export const httpOutboundSettingsPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    base_url: z.string().url().optional(),
    auth_kind: z
      .enum(["none", "bearer", "basic", "oauth2_client_credentials"])
      .optional(),
    dialect: z.enum(["rest", "odata_v4", "odata_v2"]).optional(),
    token_url: z.string().url().optional(),
    odata_service_path: z.string().optional(),
    routes: z
      .array(
        z.object({
          id: z.string().min(1),
          source: z.enum(["finance.monthly", "invoice.issued"]),
          method: z.enum(["GET", "POST", "PUT", "PATCH"]).default("POST"),
          path: z.string().min(1),
          notes: z.string().optional(),
        }),
      )
      .optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

export function httpOutboundConfigExists(): boolean {
  return existsSync(configPath());
}
