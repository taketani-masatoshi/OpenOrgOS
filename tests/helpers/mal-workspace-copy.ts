import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInstallRoot, refreshOrgOsPaths } from "../../src/lib/orgos-paths.js";
import { setTenantId } from "../../src/lib/tenant.js";

/**
 * A throwaway copy of the mal tenant in its own ORGOS_WORKSPACE.
 *
 * Invoice and hospitality end-to-end tests need mal's real module billing
 * config, but posting their journal entries into the live tenant is what
 * assertJournalWriteAllowed exists to prevent. Copies the data the run reads
 * (24MB of docs are not among it) and lets the run write freely.
 */
export function setupMalWorkspaceCopy(): { dir: string; restore: () => void } {
  const prevWorkspace = process.env.ORGOS_WORKSPACE;
  const prevTenant = process.env.ORGOS_TENANT;
  const source = join(getInstallRoot(), "tenants/mal");
  const dir = mkdtempSync(join(tmpdir(), "orgos-mal-copy-"));
  const tenantDir = join(dir, "tenants", "mal");

  mkdirSync(tenantDir, { recursive: true });
  cpSync(join(source, "data"), join(tenantDir, "data"), { recursive: true });
  for (const file of ["tenant.yaml", "modules.yaml", "standards.yaml", "regulations.yaml"]) {
    cpSync(join(source, file), join(tenantDir, file));
  }
  mkdirSync(join(tenantDir, "docs"), { recursive: true });

  process.env.ORGOS_WORKSPACE = dir;
  process.env.ORGOS_TENANT = "mal";
  refreshOrgOsPaths();
  setTenantId("mal");

  return {
    dir,
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
