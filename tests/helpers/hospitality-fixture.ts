import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTenantsDir, setTenantId } from "../../src/lib/tenant.js";

export const DEFAULT_HOSPITALITY_TENANT_PREFIX = "test-hospitality";

export function seedHospitalityTenant(
  tenantId = `${DEFAULT_HOSPITALITY_TENANT_PREFIX}-${process.pid}`
): string {
  const root = join(getTenantsDir(), tenantId);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "data", "operations"), { recursive: true });
  mkdirSync(join(root, "docs", "properties", "PROP-002", "operations"), { recursive: true });

  writeFileSync(
    join(root, "tenant.yaml"),
    [
      `id: ${tenantId}`,
      "name: Hospitality Test Tenant",
      "legal_name: Hospitality Test Tenant",
      "display_name: Hospitality Test",
      "description: Ephemeral hospitality module tests",
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

  writeFileSync(
    join(root, "modules.yaml"),
    [
      "modules:",
      "  - id: hospitality",
      "    enabled: true",
      "    agent: hospitality",
      "    property_ids:",
      "      - PROP-002",
      "    docs_root: docs/properties/PROP-002/operations/",
      "    notes: ephemeral test tenant",
      "",
    ].join("\n"),
    "utf-8"
  );

  writeFileSync(
    join(root, "data", "ops-config.yaml"),
    [
      "fiscal_year:",
      "  id: FY2026",
      "  from: \"2026-02\"",
      "  to: \"2027-01\"",
      "p0:",
      "  records:",
      "    - module_id: hospitality",
      "      item_id: ops-records",
      "      label: operations/records",
      "      probe_file: records/2026/08/宿泊者名簿.csv",
      "      blocker: false",
      "",
    ].join("\n"),
    "utf-8"
  );

  writeFileSync(
    join(root, "data", "operations", "lodging-tax-rates.yaml"),
    [
      "version: 1",
      "tables:",
      "  - id: tokyo-metropolitan",
      "    jurisdiction: JP",
      "    region: Tokyo",
      "    name_ja: 東京都宿泊税",
      "    legal_basis: 東京都宿泊税条例",
      "    currency: JPY",
      "    brackets:",
      "      - min_per_person_per_night_jpy: 0",
      "        max_per_person_per_night_jpy: 10000",
      "        tax_per_person_per_night_jpy: 0",
      "      - min_per_person_per_night_jpy: 10000",
      "        max_per_person_per_night_jpy: 15000",
      "        tax_per_person_per_night_jpy: 100",
      "      - min_per_person_per_night_jpy: 15000",
      "        tax_per_person_per_night_jpy: 200",
      "",
    ].join("\n"),
    "utf-8"
  );

  writeFileSync(
    join(root, "data", "operations", "lodging-tax.yaml"),
    [
      "version: 1",
      "rate_table_id: tokyo-metropolitan",
      "filing:",
      "  authority: 東京都主税局",
      "  portal_url: https://www.tax.metro.tokyo.lg.jp/kazei/leisure/shuk/jigyousha",
      "  eltax_hint: eLTAX",
      "  lead_days:",
      "    - 14",
      "    - 7",
      "  due_rule: end_of_next_month_tokyo",
      "period_filings: []",
      "assessments: []",
      "payments: []",
      "",
    ].join("\n"),
    "utf-8"
  );

  writeFileSync(
    join(root, "data", "operations", "cleaning-reports.yaml"),
    "version: 1\nreports: []\n",
    "utf-8"
  );
  writeFileSync(
    join(root, "data", "operations", "damage-incidents.yaml"),
    "version: 1\nincidents: []\n",
    "utf-8"
  );
  writeFileSync(
    join(root, "data", "operations", "ops-recurring.yaml"),
    "version: 1\ntasks: []\n",
    "utf-8"
  );
  writeFileSync(
    join(root, "data", "operations", "id-doc-index.yaml"),
    "version: 1\nentries: []\n",
    "utf-8"
  );
  writeFileSync(
    join(root, "data", "operations", "access-codes.yaml"),
    "version: 1\nentries: []\n",
    "utf-8"
  );
  mkdirSync(join(root, "data", "permit-registry"), { recursive: true });
  writeFileSync(
    join(root, "data", "permit-registry", "permit-registry.yaml"),
    [
      "as_of: \"2026-08-24\"",
      "permits:",
      "  - id: PER-TEST-001",
      "    permit_type_id: pt-ryokan-shukuhaku",
      "    status: active",
      "    property_id: PROP-002",
      "",
    ].join("\n"),
    "utf-8"
  );

  setTenantId(tenantId);
  return root;
}

export function cleanupHospitalityTenant(
  tenantId = `${DEFAULT_HOSPITALITY_TENANT_PREFIX}-${process.pid}`
): void {
  rmSync(join(getTenantsDir(), tenantId), { recursive: true, force: true });
  setTenantId("mal");
}

export function seedGuestRegisterCsv(
  root: string,
  opts: {
    year: string;
    month: string;
    header: string[];
    rows: string[][];
    filename?: string;
  }
): string {
  const relDir = join(
    "docs",
    "properties",
    "PROP-002",
    "operations",
    "records",
    opts.year,
    opts.month
  );
  const absDir = join(root, relDir);
  mkdirSync(absDir, { recursive: true });
  const filename = opts.filename ?? "宿泊者名簿.csv";
  const lines = [
    opts.header.join(","),
    ...opts.rows.map((row) => row.join(",")),
  ];
  const abs = join(absDir, filename);
  writeFileSync(abs, lines.join("\n") + "\n", "utf-8");
  return join(relDir, filename);
}

export function writeHospitalityModulesYaml(root: string, yaml: string): void {
  writeFileSync(join(root, "modules.yaml"), yaml, "utf-8");
}
