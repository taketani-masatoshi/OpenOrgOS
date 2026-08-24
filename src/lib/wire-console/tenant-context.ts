import { runWithTenantId, runWithTenantIdAsync } from "../tenant.js";
import { isWireConsoleEnabled } from "./tenant-registry.js";

/** Validate only — never mutate the process-wide tenant sticky id. */
export function assertWireConsoleTenant(tenantId: string): void {
  if (!/^[a-z0-9_-]+$/.test(tenantId)) {
    throw new Error(`Invalid tenant id: ${tenantId}`);
  }
  if (!isWireConsoleEnabled(tenantId)) {
    throw new Error(`Tenant ${tenantId} does not have wire_console: true`);
  }
}

/**
 * Run Wire Console work under a request-scoped tenant (AsyncLocalStorage).
 * Must not call setTenantId — that permanently steals Chat / shared console tenants.
 */
export function withWireConsoleTenant<T>(tenantId: string, fn: () => T): T {
  assertWireConsoleTenant(tenantId);
  return runWithTenantId(tenantId, fn);
}

export async function withWireConsoleTenantAsync<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  assertWireConsoleTenant(tenantId);
  return runWithTenantIdAsync(tenantId, fn);
}
