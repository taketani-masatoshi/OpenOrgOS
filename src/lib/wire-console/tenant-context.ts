import { setTenantId } from "../tenant.js";
import { isWireConsoleEnabled } from "./tenant-registry.js";

export function assertWireConsoleTenant(tenantId: string): void {
  if (!/^[a-z0-9_-]+$/.test(tenantId)) {
    throw new Error(`Invalid tenant id: ${tenantId}`);
  }
  if (!isWireConsoleEnabled(tenantId)) {
    throw new Error(`Tenant ${tenantId} does not have wire_console: true`);
  }
  setTenantId(tenantId);
}

export function withWireConsoleTenant<T>(tenantId: string, fn: () => T): T {
  assertWireConsoleTenant(tenantId);
  return fn();
}

export async function withWireConsoleTenantAsync<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  assertWireConsoleTenant(tenantId);
  return fn();
}
