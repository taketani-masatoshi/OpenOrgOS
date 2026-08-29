import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { getTenantDir, setTenantId } from "../../src/lib/tenant.js";

/**
 * Config a test may flip while exercising the real tenant. These live at the
 * tenant root, which `resolveTenantPath` does not map, so they are joined onto
 * `getTenantDir()` directly.
 */
export const TENANT_SSOT_FILES = ["standards.yaml", "modules.yaml", "regulations.yaml"] as const;

/**
 * Restore a tenant's configuration after each test.
 *
 * Several code paths (module activation, approved config changes) write to the
 * tenant SSOT. Run against a live tenant without a restore, `vitest run` silently
 * edits the company's enabled standards and regulations, and the YAML round-trip
 * drops the comments explaining why each one is set that way.
 */
export function preserveTenantSsot(tenantId: string): void {
  let snapshot: Map<string, string>;

  beforeEach(() => {
    setTenantId(tenantId);
    snapshot = new Map();
    for (const rel of TENANT_SSOT_FILES) {
      const path = join(getTenantDir(), rel);
      if (!existsSync(path)) continue;
      snapshot.set(path, readFileSync(path, "utf-8"));
    }
  });

  afterEach(() => {
    for (const [path, content] of snapshot) writeFileSync(path, content, "utf-8");
  });
}
