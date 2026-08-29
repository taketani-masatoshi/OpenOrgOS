import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import YAML from "yaml";
import {
  controlPlaneFileSchema,
  controlPlaneTenantSchema,
  type ControlPlaneTenant,
} from "../../../schemas/product/control-plane.js";
import { getWorkspaceRoot, getTenantsDir } from "../orgos-paths.js";
import { getClock } from "../runtime-context.js";
import { resolveTenantFromEnv } from "../orgos-cli.js";
import { listLedgerProductTenantIds } from "./ledger-product-tenant.js";
import { loadLedgerSubscription } from "./ledger-subscription.js";
import { runWithTenantId } from "../tenant.js";

const FLEET_DIR = "product-fleet";

function controlPlanePath(): string {
  return join(getWorkspaceRoot(), FLEET_DIR, "control-plane.yaml");
}

export function loadControlPlane() {
  const path = controlPlanePath();
  if (!existsSync(path)) {
    return controlPlaneFileSchema.parse({ version: 1, tenants: [] });
  }
  return controlPlaneFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

function saveControlPlane(file: ReturnType<typeof loadControlPlane>): void {
  mkdirSync(join(getWorkspaceRoot(), FLEET_DIR), { recursive: true });
  writeFileSync(controlPlanePath(), YAML.stringify(file), "utf-8");
}

export function findControlPlaneTenant(tenantId: string): ControlPlaneTenant | undefined {
  return loadControlPlane().tenants.find((row) => row.tenant_id === tenantId);
}

function loadSubscriptionForTenant(tenantId: string) {
  const tenantYaml = join(getTenantsDir(), tenantId, "tenant.yaml");
  if (!existsSync(tenantYaml)) return null;
  return runWithTenantId(tenantId, () => loadLedgerSubscription());
}

export function upsertControlPlaneTenant(input: {
  tenantId: string;
  companyName: string;
  plan?: ControlPlaneTenant["plan"];
  status?: ControlPlaneTenant["status"];
  accountantParentId?: string;
  purgeAfter?: string | null;
}): ControlPlaneTenant {
  const tenantId = input.tenantId.trim().toLowerCase();
  const hostSlug = tenantId;
  const suffix = process.env.ORGOS_LEDGER_HOST_SUFFIX?.trim() || ".ledger.localhost";
  const file = loadControlPlane();
  const now = getClock().now().toISOString();
  const index = file.tenants.findIndex((row) => row.tenant_id === tenantId);
  const sub = loadSubscriptionForTenant(tenantId);
  const row = controlPlaneTenantSchema.parse({
    tenant_id: tenantId,
    company_name: input.companyName.trim(),
    host_slug: hostSlug,
    plan: input.plan ?? sub?.plan,
    status: input.status ?? "active",
    subscription_status: sub?.status,
    accountant_parent_id:
      input.accountantParentId ?? file.tenants[index]?.accountant_parent_id,
    host: `${hostSlug}${suffix}`,
    purge_after:
      input.purgeAfter === null
        ? undefined
        : input.purgeAfter ?? file.tenants[index]?.purge_after,
    updated_at: now,
  });
  if (index >= 0) file.tenants[index] = { ...file.tenants[index]!, ...row, updated_at: now };
  else file.tenants.push(row);
  saveControlPlane(file);
  return row;
}

export function syncControlPlaneFromProductTenants(): ControlPlaneTenant[] {
  const synced: ControlPlaneTenant[] = [];
  for (const tenantId of listLedgerProductTenantIds()) {
    const tenantYaml = join(getTenantsDir(), tenantId, "tenant.yaml");
    let companyName = tenantId;
    if (existsSync(tenantYaml)) {
      const raw = readFileSync(tenantYaml, "utf-8");
      const match = raw.match(/^name:\s*(.+)$/m);
      if (match?.[1]) companyName = match[1].trim();
    }
    const sub = runWithTenantId(tenantId, () => loadLedgerSubscription());
    synced.push(
      upsertControlPlaneTenant({
        tenantId,
        companyName,
        plan: sub?.plan,
        status: "active",
      }),
    );
  }
  return synced;
}

export function resolveTenantFromHost(host: string): string | null {
  const suffix = process.env.ORGOS_LEDGER_HOST_SUFFIX?.trim() || ".ledger.localhost";
  const normalized = host.split(":")[0]?.toLowerCase() ?? "";
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) return null;
  const row = loadControlPlane().tenants.find(
    (tenant) => tenant.host_slug === slug && tenant.status === "active",
  );
  return row?.tenant_id ?? null;
}

export function resolveExplicitTenantFromRequest(req: IncomingMessage): string | null {
  const header = req.headers["x-orgos-tenant"];
  if (typeof header === "string" && header.trim()) {
    return header.trim().toLowerCase();
  }
  const host = req.headers.host;
  if (host) {
    const fromHost = resolveTenantFromHost(host);
    if (fromHost) return fromHost;
  }
  return null;
}

export function isRequestTenantRequired(): boolean {
  return process.env.ORGOS_REQUIRE_REQUEST_TENANT === "1";
}

export function resolveTenantFromRequest(req: IncomingMessage): string | null {
  const explicit = resolveExplicitTenantFromRequest(req);
  if (explicit) return explicit;
  if (isRequestTenantRequired()) return null;
  try {
    return resolveTenantFromEnv() ?? null;
  } catch {
    return null;
  }
}

export function linkAccountantClient(input: {
  clientTenantId: string;
  accountantTenantId: string;
}): ControlPlaneTenant {
  const file = loadControlPlane();
  const index = file.tenants.findIndex(
    (row) => row.tenant_id === input.clientTenantId,
  );
  if (index < 0) {
    throw new Error(`Control plane tenant not found: ${input.clientTenantId}`);
  }
  const now = getClock().now().toISOString();
  file.tenants[index] = controlPlaneTenantSchema.parse({
    ...file.tenants[index]!,
    accountant_parent_id: input.accountantTenantId,
    updated_at: now,
  });
  saveControlPlane(file);
  return file.tenants[index]!;
}

export function listAccountantClientTenants(accountantTenantId: string): ControlPlaneTenant[] {
  return loadControlPlane().tenants.filter(
    (row) => row.accountant_parent_id === accountantTenantId && row.status === "active",
  );
}
