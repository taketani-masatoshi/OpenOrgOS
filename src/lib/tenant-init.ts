import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { modulesFileSchema } from "../../schemas/modules.js";
import { seedRegulationDocs } from "./regulations.js";
import { getModuleSeedDir, listModuleSeedFiles } from "./modules.js";
import { setTenantId, TENANTS_DIR, loadTenantConfig } from "./tenant.js";

const TEMPLATE_DIR = join(TENANTS_DIR, "_template");

export interface TenantInitOptions {
  id: string;
  name?: string;
  fromModules?: string[];
  force?: boolean;
}

export function runTenantInit(options: TenantInitOptions): void {
  const id = options.id.trim();
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error(`Invalid tenant id "${id}" — use lowercase letters, digits, hyphens`);
  }

  const dest = join(TENANTS_DIR, id);
  if (existsSync(dest) && !options.force) {
    throw new Error(`Tenant "${id}" already exists at ${dest} (use --force to overwrite)`);
  }

  if (!existsSync(TEMPLATE_DIR)) {
    throw new Error(`Missing template: ${TEMPLATE_DIR}`);
  }

  mkdirSync(dest, { recursive: true });
  cpSync(TEMPLATE_DIR, dest, { recursive: true, filter: (src) => !src.endsWith(".example") });

  const displayName = options.name ?? id;
  writeTenantYaml(dest, id, displayName);
  applyModuleBindings(dest, options.fromModules);
  writeSkeletonData(dest, id, displayName, options.fromModules);

  setTenantId(id);
  const seedResult = seedRegulationDocs();
  console.log(`✓ Tenant "${id}" initialized at tenants/${id}/`);
  console.log(`  Regulations seeded: ${seedResult.seeded.join(", ") || "(none)"}`);
  if (seedResult.skipped.length) {
    console.log(`  Skipped (exists): ${seedResult.skipped.join(", ")}`);
  }
}

function writeTenantYaml(dest: string, id: string, name: string): void {
  const path = join(dest, "tenant.yaml");
  let raw = readFileSync(path, "utf-8");
  raw = raw
    .replace(/^id:.*$/m, `id: ${id}`)
    .replace(/^name:.*$/m, `name: ${name}`)
    .replace(/^legal_name:.*$/m, `legal_name: ${name}`)
    .replace(/^display_name:.*$/m, `display_name: ${name}`)
    .replace(/^description:.*$/m, `description: ${name} — Steward OS スケルトン`);
  if (!raw.includes("lifecycle:")) {
    raw += "\nlifecycle: skeleton\n";
  }
  writeFileSync(path, raw, "utf-8");
}

function applyModuleBindings(dest: string, fromModules?: string[]): void {
  if (!fromModules?.length) return;

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

function writeSkeletonData(
  dest: string,
  id: string,
  name: string,
  fromModules?: string[]
): void {
  const dataDir = join(dest, "data");
  const docsDir = join(dest, "docs");

  writeFile(join(dataDir, "company.yaml"), skeletonCompany(name));
  writeFile(join(dataDir, "ops-config.yaml"), skeletonOpsConfig());
  writeFile(join(dataDir, "classification-registry.yaml"), skeletonClassificationRegistry());
  writeFile(join(dataDir, "document-io.yaml"), "inbox_items: []\noutbox_items: []\n");
  writeFile(join(dataDir, "dependency-graph.yaml"), skeletonDependencyGraph(id));
  writeFile(join(dataDir, "hr", "employees.yaml"), "employees: []\n");
  writeFile(join(dataDir, "executive", "calendar.yaml"), "events: []\n");
  writeFile(join(dataDir, "executive", "tasks.yaml"), "tasks: []\n");
  writeFile(join(dataDir, "executive", "one-on-ones.yaml"), "meetings: []\n");
  writeFile(join(dataDir, "executive", "external-contacts.yaml"), "contacts: []\n");

  writeFile(join(dataDir, "finance", "fixed-costs.yaml"), "items: []\n");
  writeFile(join(dataDir, "finance", "payroll.yaml"), "officer_compensation_annual: 0\n");
  writeFile(
    join(dataDir, "finance", "cash-balance.yaml"),
    `as_of: "2027-01-31"\nstatus: template\ncurrency: JPY\naccounts: []\ntotal: null\nnotes: |\n  スケルトン — 残高入力後 status: confirmed\n`
  );
  writeFile(join(dataDir, "finance", "loans.yaml"), "loans: []\n");
  writeFile(
    join(dataDir, "finance", "fixed-assets.yaml"),
    `as_of: "2027-01-31"\nfiscal_year: FY2026\ncurrency: JPY\nassets: []\nsummary:\n  total_acquisition_cost: 0\n  total_accumulated_depreciation: 0\n  total_book_value: 0\n  annual_depreciation_fy_current: 0\n`
  );
  writeFile(
    join(dataDir, "finance", "tax-profile.yaml"),
    `entity:\n  name: "${name}"\n  type: 株式会社\nfiscal_year:\n  end_month: 1\nconsumption_tax:\n  status: TBD\ncorporate_tax:\n  category: TBD\n  capital_stock: TBD\n`
  );
  writeFile(
    join(dataDir, "finance", "chart-of-accounts.yaml"),
    `version: "1"\ncurrency: JPY\naccounts:\n  - code: "1100"\n    name: 現金及び預金\n    type: asset\n    normal_balance: debit\ncategory_mapping:\n  revenue: {}\n  expense: {}\n`
  );

  mkdirSync(join(dataDir, "finance", "monthly"), { recursive: true });
  mkdirSync(join(dataDir, "contracts"), { recursive: true });

  const rentalEnabled = !fromModules?.length || fromModules.includes("rental");
  if (rentalEnabled) {
    mkdirSync(join(dataDir, "properties"), { recursive: true });
    writeFile(
      join(dataDir, "properties", "PROP-001.yaml"),
      skeletonProperty(name)
    );
    writeFile(
      join(docsDir, "properties", "PROP-001-minato", "operations", "00-README.md"),
      `# PROP-001 運用\n\nスケルトン — 運用手順を追加してください。\n`
    );
  }

  writeFile(join(dataDir, "plans", "business-plan.yaml"), skeletonBusinessPlan(name));
  writeFile(
    join(dataDir, "plans", "property-revenue.yaml"),
    rentalEnabled
      ? "rental:\n  - property_id: PROP-001\n    monthly_rent: 0\n    annual_rent: 0\n    vacancy_rate: 0\n    management_fee: 0\nhotel: []\n"
      : "rental: []\nhotel: []\n"
  );
  writeFile(join(dataDir, "plans", "revenue-plan.yaml"), skeletonYearPlan("revenue"));
  writeFile(join(dataDir, "plans", "profit-plan.yaml"), skeletonYearPlan("profit"));
  writeFile(join(dataDir, "plans", "expense-plan.yaml"), skeletonExpensePlan());
  writeFile(join(dataDir, "plans", "investment-plan.yaml"), skeletonYearPlan("investment"));
  writeFile(join(dataDir, "plans", "debt-plan.yaml"), skeletonDebtPlan());
  writeFile(join(dataDir, "plans", "yojitsu-fy2026.yaml"), skeletonYojitsu(name));

  copyModuleSeeds(dest, fromModules);
}

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

function skeletonCompany(name: string): string {
  return `name: "${name}"
fiscal_year_end_month: 1
business_description: |
  スケルトン — 事業概要を記載
`;
}

function skeletonOpsConfig(): string {
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

vision: |
  ${name} — スケルトン事業計画

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
  return existsSync(join(TENANTS_DIR, id, "tenant.yaml"));
}
