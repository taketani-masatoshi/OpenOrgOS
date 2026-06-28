import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { listTenantIds, TENANTS_DIR, type TenantConfig } from "../tenant.js";

function readTenantConfigById(tenantId: string): TenantConfig {
  const path = join(TENANTS_DIR, tenantId, "tenant.yaml");
  const raw = readFileSync(path, "utf-8");
  return YAML.parse(raw) as TenantConfig;
}

export function isWireConsoleEnabled(tenantId: string): boolean {
  return readTenantConfigById(tenantId).wire_console === true;
}

export interface WireConsoleTenantSummary {
  id: string;
  name: string;
  display_name?: string;
  lifecycle?: string;
}

function includeTestLifecycleTenants(): boolean {
  return process.env.WIRE_CONSOLE_INCLUDE_TEST_TENANTS === "1";
}

export function listWireConsoleTenants(): WireConsoleTenantSummary[] {
  return listTenantIds()
    .filter((id) => {
      if (!isWireConsoleEnabled(id)) return false;
      const cfg = readTenantConfigById(id);
      if (cfg.lifecycle === "test" && !includeTestLifecycleTenants()) return false;
      return true;
    })
    .map((id) => {
      const cfg = readTenantConfigById(id);
      return {
        id: cfg.id,
        name: cfg.name,
        display_name: cfg.display_name,
        lifecycle: cfg.lifecycle,
      };
    });
}

export function anyWireConsoleTenantEnabled(): boolean {
  return listWireConsoleTenants().length > 0;
}
