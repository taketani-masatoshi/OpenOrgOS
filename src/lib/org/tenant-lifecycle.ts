import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";
import {
  tenantLifecycleSchema,
  type TenantLifecycle,
  type TenantLifecycleStatus,
} from "../../../schemas/org/tenant-lifecycle.js";
import type { OperatorRecord } from "../../../schemas/org/operator.js";
import { tenantDataPath, getTenantId } from "../tenant.js";
import { writeYamlFile } from "../utils.js";

export const TENANT_LIFECYCLE_REL = "org/tenant-lifecycle.yaml";

let cachedLifecycle: TenantLifecycle | undefined;
let cachedLifecycleTenant: string | undefined;

export function tenantLifecyclePath(): string {
  return tenantDataPath("org", "tenant-lifecycle.yaml");
}

export function clearTenantLifecycleCacheForTests(): void {
  cachedLifecycle = undefined;
  cachedLifecycleTenant = undefined;
}

export function loadTenantLifecycle(): TenantLifecycle {
  const tenantId = getTenantId();
  if (cachedLifecycle && cachedLifecycleTenant === tenantId) return cachedLifecycle;

  const path = tenantLifecyclePath();
  if (!existsSync(path)) {
    cachedLifecycleTenant = tenantId;
    cachedLifecycle = { version: "1", status: "active" };
    return cachedLifecycle;
  }

  cachedLifecycleTenant = tenantId;
  cachedLifecycle = tenantLifecycleSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
  return cachedLifecycle;
}

export function saveTenantLifecycle(lifecycle: TenantLifecycle): string {
  const path = tenantLifecyclePath();
  writeYamlFile(path, lifecycle);
  cachedLifecycleTenant = getTenantId();
  cachedLifecycle = lifecycle;
  return path;
}

export function getTenantLifecycleStatus(): TenantLifecycleStatus {
  return loadTenantLifecycle().status;
}

/** SSO allowed for this operator given tenant lifecycle. */
export function operatorAllowedForLifecycleSso(op: OperatorRecord): boolean {
  const status = getTenantLifecycleStatus();
  if (status === "active") return true;
  if (status === "archived" || status === "purged") return false;
  if (status === "winding_down") {
    if (op.seat_kind === "liquidator") return true;
    return op.role === "ceo" || op.role === "approver";
  }
  return false;
}

export function isGuestOperatorExpired(op: Pick<OperatorRecord, "guest_expires_at">): boolean {
  const raw = op.guest_expires_at?.trim();
  if (!raw) return false;
  const end = Date.parse(raw);
  if (Number.isNaN(end)) return false;
  return end < Date.now();
}
