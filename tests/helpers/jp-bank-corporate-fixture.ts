import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTenantsDir, setTenantId } from "../../src/lib/tenant.js";

export const JP_BANK_FIXTURE_ROOT = join(
  process.cwd(),
  "tests",
  "fixtures",
  "jp-bank-corporate",
  "tenant"
);

export function seedJpBankCorporateTenant(
  tenantId = `test-jp-bank-${process.pid}`
): string {
  const root = join(getTenantsDir(), tenantId);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  const templateData = join(getTenantsDir(), "_template", "data");
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
  setTenantId(tenantId);
  return root;
}

export function cleanupJpBankCorporateTenant(
  tenantId = `test-jp-bank-${process.pid}`
): void {
  rmSync(join(getTenantsDir(), tenantId), { recursive: true, force: true });
}
