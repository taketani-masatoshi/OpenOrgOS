import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../../src/lib/orgos-paths.js";
import { setTenantId } from "../../src/lib/tenant.js";

export const TEMP_ANALYTICS_TENANT_ID = "analytics-fixture";

export interface TempAnalyticsTenant {
  dir: string;
  tenantId: string;
  restore: () => void;
}

/**
 * Isolated workspace for analytics history / snapshot tests.
 * Keeps real tenant SoT (metrics, snapshot-history, docs) untouched.
 */
export function setupTempAnalyticsTenant(files?: {
  snapshotHistory?: string;
  metrics?: string;
  kpiTargets?: string;
}): TempAnalyticsTenant {
  const prevWorkspace = process.env.ORGOS_WORKSPACE;
  const prevTenant = process.env.ORGOS_TENANT;
  const dir = mkdtempSync(join(tmpdir(), "orgos-analytics-"));
  const tenantDir = join(dir, "tenants", TEMP_ANALYTICS_TENANT_ID);
  mkdirSync(join(tenantDir, "data", "analytics"), { recursive: true });
  mkdirSync(join(tenantDir, "docs"), { recursive: true });

  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    [
      `id: ${TEMP_ANALYTICS_TENANT_ID}`,
      "name: Analytics fixture",
      "lifecycle: test",
      "operation_mode: development",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(tenantDir, "modules.yaml"),
    "modules:\n  - id: rental\n    enabled: false\n    agent: rental\n",
    "utf8",
  );

  const analyticsDir = join(tenantDir, "data", "analytics");
  if (files?.snapshotHistory !== undefined) {
    writeFileSync(join(analyticsDir, "snapshot-history.yaml"), files.snapshotHistory, "utf8");
  }
  if (files?.metrics !== undefined) {
    writeFileSync(join(analyticsDir, "metrics.yaml"), files.metrics, "utf8");
  }
  if (files?.kpiTargets !== undefined) {
    writeFileSync(join(analyticsDir, "kpi-targets.yaml"), files.kpiTargets, "utf8");
  }

  process.env.ORGOS_WORKSPACE = dir;
  process.env.ORGOS_TENANT = TEMP_ANALYTICS_TENANT_ID;
  refreshOrgOsPaths();
  setTenantId(TEMP_ANALYTICS_TENANT_ID);

  return {
    dir,
    tenantId: TEMP_ANALYTICS_TENANT_ID,
    restore() {
      rmSync(dir, { recursive: true, force: true });
      if (prevWorkspace === undefined) delete process.env.ORGOS_WORKSPACE;
      else process.env.ORGOS_WORKSPACE = prevWorkspace;
      if (prevTenant === undefined) delete process.env.ORGOS_TENANT;
      else process.env.ORGOS_TENANT = prevTenant;
      refreshOrgOsPaths();
      setTenantId(prevTenant?.trim() || "mal");
    },
  };
}
