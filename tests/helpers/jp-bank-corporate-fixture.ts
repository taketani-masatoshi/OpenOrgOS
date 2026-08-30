import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../../src/lib/orgos-paths.js";
import { getTenantsDir, setTenantId } from "../../src/lib/tenant.js";

export const JP_BANK_FIXTURE_ROOT = join(
  process.cwd(),
  "tests",
  "fixtures",
  "jp-bank-corporate",
  "tenant"
);

/** Workspace roots handed out by seed(), keyed by tenant id, so cleanup can undo them. */
const workspaces = new Map<string, { root: string; previous?: string }>();

/**
 * Seeds the fixture into a throwaway workspace rather than the install tree:
 * journal posting is blocked for install-tree tenants under vitest, and a
 * tenant left in `tenants/` would also show up in workspace-wide validate.
 */
export function seedJpBankCorporateTenant(
  tenantId = `test-jp-bank-${process.pid}`
): string {
  const previous = process.env.ORGOS_WORKSPACE;
  const workspace = mkdtempSync(join(tmpdir(), "orgos-jp-bank-"));
  const templateData = join(getTenantsDir(), "_template", "data");

  process.env.ORGOS_WORKSPACE = workspace;
  refreshOrgOsPaths();

  const root = join(workspace, "tenants", tenantId);
  mkdirSync(root, { recursive: true });
  if (existsSync(templateData)) {
    cpSync(templateData, join(root, "data"), { recursive: true });
  }
  cpSync(JP_BANK_FIXTURE_ROOT, root, { recursive: true, force: true });
  writeFileSync(
    join(root, "tenant.yaml"),
    [
      `id: ${tenantId}`,
      "name: JP Bank Fixture Company",
      "legal_name: JP Bank Fixture Company",
      "display_name: Bank Fixture",
      "description: Test-only fictional tenant",
      "default: false",
      "lifecycle: test",
      "jurisdiction: JP",
      "entity_form: kk",
      "display_language: ja",
      "default_currency: JPY",
      "",
    ].join("\n"),
    "utf-8"
  );
  workspaces.set(tenantId, { root: workspace, previous });
  setTenantId(tenantId);
  return root;
}

export function cleanupJpBankCorporateTenant(
  tenantId = `test-jp-bank-${process.pid}`
): void {
  const entry = workspaces.get(tenantId);
  if (!entry) return;
  workspaces.delete(tenantId);
  rmSync(entry.root, { recursive: true, force: true });
  if (entry.previous === undefined) delete process.env.ORGOS_WORKSPACE;
  else process.env.ORGOS_WORKSPACE = entry.previous;
  refreshOrgOsPaths();
}
