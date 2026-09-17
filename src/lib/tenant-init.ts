import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, basename, relative, sep } from "node:path";
import YAML from "yaml";
import { modulesFileSchema } from "../../schemas/modules.js";
import { seedRegulationDocs } from "./regulations.js";
import { getModuleSeedDir, listModuleSeedFiles, loadModulesFile } from "./modules.js";
import { getTenantsDir } from "./orgos-paths.js";
import { setTenantId, loadTenantConfig, getTenantTemplateDir, getTenantDir, runWithTenantId } from "./tenant.js";
import { ensureExecutiveMailConfig } from "./correspondence/ensure-mail-config.js";
import {
  seedExecutiveYamlFromExamples,
  seedProtocolYamlFromExamples,
} from "./tenant-scaffold.js";
import { initIso37000SelfDeclaration } from "./org/governance-principles.js";

export interface TenantInitOptions {
  id: string;
  name?: string;
  fromModules?: string[];
  force?: boolean;
  jurisdiction?: string;
  entityForm?: string;
  displayLanguage?: string;
  legalSubdivision?: string;
  wireConsole?: boolean;
  /** Ledger product: no rental sample · no assumed FY end month. */
  productSkeleton?: boolean;
}

export function runTenantInit(options: TenantInitOptions): void {
  const id = options.id.trim();
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error(`Invalid tenant id "${id}" — use lowercase letters, digits, hyphens`);
  }

  const dest = join(getTenantsDir(), id);
  if (existsSync(dest) && !options.force) {
    throw new Error(`Tenant "${id}" already exists at ${dest} (use --force to overwrite)`);
  }

  const templateDir = getTenantTemplateDir();
  if (!existsSync(templateDir)) {
    throw new Error(`Missing template: ${templateDir}`);
  }

  mkdirSync(dest, { recursive: true });
  cpSync(templateDir, dest, {
    recursive: true,
    filter: (src) =>
      shouldCopyTemplateEntry(src, templateDir, {
        productSkeleton: Boolean(options.productSkeleton),
      }),
  });

  const displayName = options.name ?? id;
  writeTenantYaml(dest, id, displayName, options);
  applyModuleBindings(dest, options.fromModules);
  writeSkeletonData(dest, id, displayName, options.fromModules, {
    productSkeleton: options.productSkeleton,
  });

  const seedResult = runWithTenantId(id, () => {
    const seeded = seedRegulationDocs();
    try {
      const iso37000 = initIso37000SelfDeclaration({ force: Boolean(options.force) });
      console.log(`  ISO 37000 draft: ${iso37000.declaration_path}`);
    } catch (err) {
      console.log(
        `  ISO 37000 init skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return seeded;
  });
  console.log(`✓ Tenant "${id}" initialized at tenants/${id}/`);
  console.log(`  Regulations seeded: ${seedResult.seeded.join(", ") || "(none)"}`);
  if (seedResult.skipped.length) {
    console.log(`  Skipped (exists): ${seedResult.skipped.join(", ")}`);
  }

  if (options.wireConsole) {
    void import("./wire-console/process.js").then(async ({ tryStartWireConsoleAfterInit }) => {
      const manifest = await tryStartWireConsoleAfterInit();
      if (manifest) console.log(`  Wire Console: ${manifest.url}`);
    });
  }
}

function writeTenantYaml(dest: string, id: string, name: string, options: TenantInitOptions): void {
  const path = join(dest, "tenant.yaml");
  const raw = readFileSync(path, "utf-8");
  const doc = YAML.parseDocument(raw);
  doc.set("id", id);
  doc.set("name", name);
  doc.set("legal_name", name);
  doc.set("display_name", name);
  doc.set("description", `${name} — OrgOS スケルトン`);
  if (!doc.has("lifecycle")) {
    doc.set("lifecycle", "skeleton");
  }
  const jurisdiction = options.jurisdiction ?? "JP";
  doc.set("jurisdiction", jurisdiction);
  if (options.entityForm) {
    doc.set("entity_form", options.entityForm);
  }
  if (jurisdiction === "US") {
    if (!doc.has("locale")) doc.set("locale", "en-US");
    if (!doc.has("default_currency")) doc.set("default_currency", "USD");
  }
  if (jurisdiction === "SG") {
    if (!doc.has("locale")) doc.set("locale", "en-SG");
    if (!doc.has("default_currency")) doc.set("default_currency", "SGD");
  }
  if (jurisdiction === "EE") {
    if (!doc.has("locale")) doc.set("locale", "et-EE");
    if (!doc.has("default_currency")) doc.set("default_currency", "EUR");
  }
  if (jurisdiction === "HK") {
    if (!doc.has("locale")) doc.set("locale", "en-HK");
    if (!doc.has("default_currency")) doc.set("default_currency", "HKD");
  }
  if (options.displayLanguage) {
    doc.set("display_language", options.displayLanguage);
  }
  if (options.legalSubdivision) {
    doc.set("legal_subdivision", options.legalSubdivision);
  } else if (jurisdiction === "US" && !doc.has("legal_subdivision")) {
    doc.set("legal_subdivision", "DE");
  }
  if (options.wireConsole) {
    doc.set("wire_console", true);
  }
  writeFileSync(path, String(doc), "utf-8");
}

function applyModuleBindings(dest: string, fromModules?: string[]): void {
  // undefined = leave template defaults; [] = disable all listed modules
  if (fromModules === undefined) return;

  const path = join(dest, "modules.yaml");
  const file = readYamlFileRaw(path);
  const parsed = modulesFileSchema.parse(YAML.parse(file));

  for (const mod of parsed.modules) {
    mod.enabled = fromModules.includes(mod.id) || fromModules.includes(mod.agent);
  }

  writeFileSync(path, YAML.stringify(parsed), "utf-8");
}

function readYamlFileRaw(path: string): string {
  return readFileSync(path, "utf-8");
}

export interface ScaffoldTenantDataResult {
  created: string[];
  skipped: string[];
}

/** Fill missing skeleton data/ files without overwriting existing tenant SoT. */
export function scaffoldMissingTenantData(): ScaffoldTenantDataResult {
  const dest = getTenantDir();
  const cfg = loadTenantConfig();
  const name = cfg.legal_name ?? cfg.name ?? basename(dest);
  const id = basename(dest);
  const enabledModules = loadModulesFile()
    .modules.filter((m) => m.enabled)
    .map((m) => m.id);
  return writeSkeletonData(dest, id, name, enabledModules, { skipExisting: true });
}

interface WriteSkeletonOptions {
  skipExisting?: boolean;
  productSkeleton?: boolean;
}

function writeSkeletonData(
  dest: string,
  id: string,
  name: string,
  fromModules?: string[],
  options?: WriteSkeletonOptions
): ScaffoldTenantDataResult {
  const dataDir = join(dest, "data");
  const docsDir = join(dest, "docs");
  const result: ScaffoldTenantDataResult = { created: [], skipped: [] };
  const productSkeleton = Boolean(options?.productSkeleton);

  const put = (rel: string, content: string) => {
    const abs = join(dest, rel);
    if (options?.skipExisting && existsSync(abs)) {
      result.skipped.push(rel);
      return;
    }
    writeFile(abs, content);
    result.created.push(rel);
  };

  put("data/company.yaml", skeletonCompany(name, id, { productSkeleton }));
  put("data/ops-config.yaml", skeletonOpsConfig({ productSkeleton }));
  put("data/classification-registry.yaml", skeletonClassificationRegistry());
  put("data/document-io.yaml", "inbox_items: []\noutbox_items: []\n");
  put("data/dependency-graph.yaml", skeletonDependencyGraph(id));
  put("data/hr/employees.yaml", "employees: []\n");
  seedExecutiveYamlFromExamples(dataDir, options?.skipExisting, result);
  seedProtocolYamlFromExamples(dataDir, options?.skipExisting, result);
  seedIntegrationsFromExample(dest, options?.skipExisting, result);
  seedExecutiveRecordsFromExample(dest, options?.skipExisting, result);

  put("data/finance/fixed-costs.yaml", "items: []\n");
  put("data/finance/payroll.yaml", "officer_compensation_annual: 0\n");
  put(
    "data/finance/cash-balance.yaml",
    YAML.stringify({
      as_of: null,
      status: "template",
      currency: "JPY",
      accounts: [],
      total: null,
      notes: "スケルトン — 残高入力後 status: confirmed",
    }),
  );
  put("data/finance/loans.yaml", "loans: []\n");
  put(
    "data/finance/fixed-assets.yaml",
    YAML.stringify({
      as_of: null,
      fiscal_year: productSkeleton ? "TBD" : "FY2026",
      status: "template",
      currency: "JPY",
      assets: [],
      summary: {
        total_acquisition_cost: 0,
        total_accumulated_depreciation: 0,
        total_book_value: 0,
        annual_depreciation_fy_current: 0,
      },
    }),
  );
  put(
    "data/finance/tax-profile.yaml",
    YAML.stringify(
      productSkeleton
        ? {
            entity: { name, type: "株式会社" },
            fiscal_year: { status: "template" },
            consumption_tax: { status: "TBD" },
            corporate_tax: { category: "TBD", capital_stock: "TBD" },
          }
        : {
            entity: { name, type: "株式会社" },
            fiscal_year: { end_month: 1 },
            consumption_tax: { status: "TBD" },
            corporate_tax: { category: "TBD", capital_stock: "TBD" },
          },
    ),
  );
  put(
    "data/finance/chart-of-accounts.yaml",
    `version: "1"\ncurrency: JPY\naccounts:\n  - code: "1100"\n    name: 現金及び預金\n    type: asset\n    normal_balance: debit\ncategory_mapping:\n  revenue: {}\n  expense: {}\n`
  );

  mkdirSync(join(dataDir, "finance", "monthly"), { recursive: true });
  mkdirSync(join(dataDir, "contracts"), { recursive: true });

  const rentalEnabled =
    fromModules === undefined ? true : fromModules.includes("rental");
  if (rentalEnabled) {
    mkdirSync(join(dataDir, "properties"), { recursive: true });
    put("data/properties/PROP-001.yaml", skeletonProperty(name));
    put(
      "docs/properties/PROP-001-minato/operations/00-README.md",
      `# PROP-001 運用\n\nスケルトン — 運用手順を追加してください。\n`
    );
  }

  put("data/plans/business-plan.yaml", skeletonBusinessPlan(name));
  put(
    "data/plans/property-revenue.yaml",
    rentalEnabled
      ? "rental:\n  - property_id: PROP-001\n    monthly_rent: 0\n    annual_rent: 0\n    vacancy_rate: 0\n    management_fee: 0\nhotel: []\n"
      : "rental: []\nhotel: []\n"
  );
  put("data/plans/revenue-plan.yaml", skeletonYearPlan("revenue"));
  put("data/plans/profit-plan.yaml", skeletonYearPlan("profit"));
  put("data/plans/expense-plan.yaml", skeletonExpensePlan());
  put("data/plans/investment-plan.yaml", skeletonYearPlan("investment"));
  put("data/plans/debt-plan.yaml", skeletonDebtPlan());
  if (!productSkeleton) {
    put("data/plans/yojitsu-fy2026.yaml", skeletonYojitsu(name));
  }

  copyModuleSeeds(dest, fromModules);
  return result;
}

/** Real operator registry must never be copied into new tenants (demo keys). */
const TEMPLATE_EXCLUDED_PATHS = new Set(["data/org/operators.yaml"]);

function shouldCopyTemplateEntry(
  src: string,
  templateDir: string,
  opts?: { productSkeleton?: boolean },
): boolean {
  const rel = relative(templateDir, src).split(sep).join("/");
  if (TEMPLATE_EXCLUDED_PATHS.has(rel)) return false;
  if (opts?.productSkeleton) {
    if (rel === "data/properties" || rel.startsWith("data/properties/")) return false;
    if (rel === "docs/properties" || rel.startsWith("docs/properties/")) return false;
  }
  if (rel.endsWith(".DS_Store") || rel.includes("/.DS_Store")) return false;
  const base = rel.split("/").pop() ?? "";
  if (base.endsWith(".yaml.example")) return true;
  if (base.endsWith(".example.md")) return true;
  if (base.endsWith(".example")) return false;
  return true;
}

function seedIntegrationsFromExample(
  dest: string,
  skipExisting?: boolean,
  result?: ScaffoldTenantDataResult
): void {
  const intDir = join(dest, "data", "integrations");
  mkdirSync(intDir, { recursive: true });
  const example = join(intDir, "integrations.yaml.example");
  const target = join(intDir, "integrations.yaml");
  const rel = "data/integrations/integrations.yaml";
  if (skipExisting && existsSync(target)) {
    result?.skipped.push(rel);
    return;
  }
  if (existsSync(example)) {
    cpSync(example, target);
    result?.created.push(rel);
  }
}

function seedExecutiveRecordsFromExample(
  dest: string,
  skipExisting?: boolean,
  result?: ScaffoldTenantDataResult
): void {
  const recDir = join(dest, "records", "executive");
  mkdirSync(recDir, { recursive: true });
  const target = join(recDir, "mail-config.yaml");
  const rel = "records/executive/mail-config.yaml";
  if (skipExisting && existsSync(target)) {
    result?.skipped.push(rel);
    return;
  }
  const tenantId = basename(dest);
  const prevTenant = process.env.ORGOS_TENANT;
  const hadTenantEnv = Object.prototype.hasOwnProperty.call(process.env, "ORGOS_TENANT");
  process.env.ORGOS_TENANT = tenantId;
  runWithTenantId(tenantId, () => {
    ensureExecutiveMailConfig({ dryRunSmtp: true, force: !skipExisting });
  });
  if (hadTenantEnv && prevTenant !== undefined) {
    process.env.ORGOS_TENANT = prevTenant;
  } else {
    delete process.env.ORGOS_TENANT;
  }
  if (existsSync(target)) {
    result?.created.push(rel);
  }
}

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

function skeletonCompany(
  name: string,
  tenantId: string,
  opts?: { productSkeleton?: boolean },
): string {
  const body: Record<string, unknown> = {
    name,
    business_description: "スケルトン — 事業概要を記載",
    public_disclosure: {
      representative_email: `ceo@${tenantId}.orgos.local`,
    },
  };
  if (!opts?.productSkeleton) {
    body.fiscal_year_end_month = 1;
  }
  return YAML.stringify(body);
}

function skeletonOpsConfig(opts?: { productSkeleton?: boolean }): string {
  if (opts?.productSkeleton) {
    return `# 運用設定 — スケルトン（製品）

skeleton: true
status: template

fiscal_year:
  id: TBD
  status: template
  plan_file: null
  from: null
  to: null

p0:
  contracts: []
  secrets: []
  cash_balance:
    enabled: true
    blocker: false
  records: []
  audits: []
`;
  }
  return `# 運用設定 — スケルトン

skeleton: true

fiscal_year:
  id: FY2026
  plan_file: data/plans/yojitsu-fy2026.yaml
  from: "2026-02"
  to: "2027-01"

p0:
  contracts: []
  secrets: []
  cash_balance:
    enabled: true
    blocker: false
  records: []
  audits: []
`;
}

function skeletonClassificationRegistry(): string {
  const templatePath = join(getTenantTemplateDir(), "data", "classification-registry.yaml");
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, "utf-8");
  }
  return `version: "1"
as_of: "2026-06-08"

levels:
  L0:
    label: 公開
    description: 公開情報
    export_allowed: true
  L1:
    label: 社内
    description: 社内情報
    export_allowed: conditional
  L2:
    label: 機密
    description: 機密情報
    export_allowed: false
  L3:
    label: 禁止出力
    description: L2 転記禁止
    export_allowed: false

agents:
  executive_steward:
    label: Executive Steward
    max_level: L2
    output_max_level: L1
  finance:
    label: Finance
    max_level: L2
    output_max_level: L1
  contract:
    label: Contract
    max_level: L1
    output_max_level: L1

resources: []
`;
}

function skeletonDependencyGraph(tenantId: string): string {
  return `version: "1"
description: |
  ${tenantId} テナント — 最小依存グラフ（スケルトン）

nodes:
  - id: data/company.yaml
    label: 会社概要
    category: file
  - id: data/plans/business-plan.yaml
    label: 事業計画
    category: file

edges: []
`;
}

function skeletonProperty(name: string): string {
  return `id: PROP-001
name: "サンプル物件"
location: "[TBD]"
type: rental
rental:
  monthly_rent: 0
  vacancy_rate: 0
  management_fee: 0
notes: |
  スケルトン — ${name}
`;
}

function skeletonBusinessPlan(name: string): string {
  return `period: "2026-2028"

mission: |
  ${name} — 組織の存在理由をここに書く（人間が確定）

vision: |
  ${name} — スケルトン事業計画

values:
  - 説明責任

segments:
  - name: "サンプル物件（賃貸）"
    description: "[TBD]"
    revenue_driver: "月額賃料"

kpi: []

years:
  - year: 2026
    revenue_plan: 0
    operating_profit_plan: 0
    investment_plan: 0
    borrowing_plan: 0
`;
}

function skeletonYearPlan(kind: string): string {
  if (kind === "revenue") {
    return `currency: JPY
years:
  - fiscal_year: FY2026
    period_from: "2026-02"
    period_to: "2027-01"
    lines:
      - id: rental
        name: サンプル物件（賃貸）
        property_id: PROP-001
        amount: 0
    total: 0
notes: revenue plan skeleton
`;
  }
  if (kind === "investment") {
    return `currency: JPY
years:
  - fiscal_year: FY2026
    period_from: "2026-02"
    period_to: "2027-01"
    items: []
    total: 0
notes: investment plan skeleton
`;
  }
  return `currency: JPY
years:
  - fiscal_year: FY2026
    period_from: "2026-02"
    period_to: "2027-01"
    revenue: 0
    gross_profit: 0
    sga: 0
    operating_profit: 0
    non_operating_net: 0
    pretax_profit: 0
    status: plan
notes: profit plan skeleton
`;
}

function skeletonExpensePlan(): string {
  return `currency: JPY
years:
  - fiscal_year: FY2026
    period_from: "2026-02"
    period_to: "2027-01"
    lines:
      - id: placeholder
        name: "[TBD]"
        amount: 0
    total: 0
notes: expense plan skeleton
`;
}

function skeletonDebtPlan(): string {
  return `currency: JPY
status: draft
summary:
  total_debt: 0
  loan_count: 0
  interest_bearing_debt: 0
  bank_borrowing: 0
loans: []
future_bank_borrowing:
  planned: false
  amount: 0
scenarios:
  - id: base
    name: ベース
    repayments: []
dscr:
  targets:
    minimum: 1.2
    warning: 1.0
notes: debt plan skeleton
`;
}

function skeletonYojitsu(name: string): string {
  const months = [
    "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
    "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01",
  ];
  const monthBlocks = months
    .map(
      (m) => `  - month: "${m}"
    plan:
      lines: []`
    )
    .join("\n");

  return `schema_version: 2
year: 2026
fiscal_year: "FY2026"
period_from: "2026-02"
period_to: "2027-01"
assumptions: |
  ${name} — yojitsu v2 スケルトン（segments 連動）
months:
${monthBlocks}
`;
}

function copyModuleSeeds(dest: string, fromModules?: string[]): void {
  if (!fromModules?.length) return;
  for (const modId of fromModules) {
    const seedDir = getModuleSeedDir(modId);
    if (!existsSync(seedDir)) continue;
    for (const file of listModuleSeedFiles(modId)) {
      if (file.endsWith(".example")) continue;
      const src = join(seedDir, file);
      const rel = readdirSync(seedDir).includes(file) ? file : null;
      if (!rel) continue;
      // Seeds stay in steward/modules — tenant copies only when data_root configured
    }
  }
}

export function validateTenantInit(id: string): boolean {
  setTenantId(id);
  loadTenantConfig();
  return existsSync(join(getTenantsDir(), id, "tenant.yaml"));
}
