import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";
import {
  accessGrantRegistrySchema,
  type AccessGrant,
  type AccessGrantRegistry,
} from "../../../schemas/org/access-grants.js";
import type { OperatorPermission } from "../../../schemas/org/operator.js";
import { getTenantId, tenantDataPath } from "../tenant.js";

let cachedTenant: string | undefined;
let cached: AccessGrantRegistry | undefined;

export function accessGrantsPath(): string {
  return tenantDataPath("org", "access-grants.yaml");
}

export function clearAccessGrantsCacheForTests(): void {
  cachedTenant = undefined;
  cached = undefined;
}

export function loadAccessGrantRegistry(): AccessGrantRegistry {
  const tenantId = getTenantId();
  if (cached && cachedTenant === tenantId) return cached;
  const path = accessGrantsPath();
  if (!existsSync(path)) {
    const empty: AccessGrantRegistry = { version: "1", grants: [] };
    cachedTenant = tenantId;
    cached = empty;
    return empty;
  }
  cachedTenant = tenantId;
  cached = accessGrantRegistrySchema.parse(YAML.parse(readFileSync(path, "utf-8")));
  return cached;
}

export function saveAccessGrantRegistry(registry: AccessGrantRegistry): string {
  const path = accessGrantsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(registry), "utf-8");
  cachedTenant = getTenantId();
  cached = registry;
  return path;
}

function isExpired(grant: AccessGrant, nowIso: string): boolean {
  return Date.parse(grant.valid_until) <= Date.parse(nowIso);
}

export function refreshGrantStatuses(nowIso = new Date().toISOString()): AccessGrantRegistry {
  const registry = loadAccessGrantRegistry();
  let changed = false;
  const grants = registry.grants.map((g) => {
    if (g.status === "revoked" || g.status === "pending") return g;
    if (g.revoked_at) {
      changed = true;
      return { ...g, status: "revoked" as const };
    }
    if (isExpired(g, nowIso) && g.status !== "expired") {
      changed = true;
      return { ...g, status: "expired" as const };
    }
    return g;
  });
  if (changed) {
    const next = { version: "1" as const, grants };
    saveAccessGrantRegistry(next);
    return next;
  }
  return { version: "1", grants };
}

export function listActiveGrantsForOperator(
  operatorId: string,
  nowIso = new Date().toISOString()
): AccessGrant[] {
  const registry = refreshGrantStatuses(nowIso);
  return registry.grants.filter(
    (g) =>
      g.target_operator_id === operatorId &&
      g.status === "active" &&
      !g.revoked_at &&
      !isExpired(g, nowIso)
  );
}


export function collectGrantExtras(operatorId: string, nowIso = new Date().toISOString()): {
  permissions: OperatorPermission[];
  allowed_agents: string[];
  data_path_globs: string[];
  grant_ids: string[];
} {
  const grants = listActiveGrantsForOperator(operatorId, nowIso);
  const permissions = new Set<OperatorPermission>();
  const agents = new Set<string>();
  const globs = new Set<string>();
  for (const g of grants) {
    for (const p of g.extra_permissions) permissions.add(p);
    for (const a of g.allowed_agents) agents.add(a);
    for (const p of g.data_path_globs) globs.add(p);
  }
  return {
    permissions: [...permissions],
    allowed_agents: [...agents],
    data_path_globs: [...globs],
    grant_ids: grants.map((g) => g.grant_id),
  };
}

export function nextGrantId(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const registry = loadAccessGrantRegistry();
  const prefix = `GRN-${day}-`;
  const nums = registry.grants
    .map((g) => (g.grant_id.startsWith(prefix) ? Number(g.grant_id.slice(prefix.length)) : 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function addAccessGrant(grant: AccessGrant): AccessGrant {
  const registry = loadAccessGrantRegistry();
  registry.grants.push(grant);
  saveAccessGrantRegistry(registry);
  return grant;
}

export function revokeAccessGrant(grantId: string, revokedAt = new Date().toISOString()): AccessGrant {
  const registry = loadAccessGrantRegistry();
  const idx = registry.grants.findIndex((g) => g.grant_id === grantId);
  if (idx < 0) throw new Error(`Access grant ${grantId} not found`);
  const updated: AccessGrant = {
    ...registry.grants[idx]!,
    status: "revoked",
    revoked_at: revokedAt,
  };
  registry.grants[idx] = updated;
  saveAccessGrantRegistry(registry);
  return updated;
}
