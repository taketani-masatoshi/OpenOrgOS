/**
 * Tenant document zones — Core (common) vs Extension (module) folder scaffold.
 * Canonical rules: steward/rules/tenant-document-zones.md
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TenantModule } from "../../schemas/modules.js";
import { loadEnabledModules, loadModulesFile } from "./modules.js";
import { MODULE_DEFAULT_DATA_ROOT } from "./module-business-data.js";
import { getTenantDir } from "./tenant.js";

export interface ScaffoldResult {
  created: string[];
  skipped: string[];
}

/** Zone A — all tenants (path relative to docs/) */
export const CORE_DOC_DIRS = [
  "company/governance",
  "company/hr/templates",
  "company/licenses",
  "company/tax",
  "company/regulations",
  "company/events",
  "company/artifacts",
  "contracts",
  "procurement/quotes/received",
  "procurement/quotes/sent",
  "procurement/orders",
  "sales/quotes",
  "finance/accounting/invoices/issued",
  "finance/accounting/invoices/received",
  "finance/accounting/quotes",
  "finance/accounting/templates",
  "finance/accounting/records",
  "io/inbox",
  "io/outbox/sent",
  "legal",
  "compliance",
  "executive",
  "exports",
  "reports/agent-summaries",
  "reports/routing-queue",
] as const;

/** Subdirs under docs/properties/{prop}/operations/ for rental / hospitality */
export const PROPERTY_OPERATIONS_SUBDIRS = [
  "templates/rental",
  "templates/compliance",
  "compliance",
  "records",
] as const;

/** Default docs_root when modules.yaml omits it */
export const MODULE_DEFAULT_DOCS_ROOT: Record<string, string> = {
  venture_capital: "docs/venture-capital/",
  jp_medical_device: "docs/medical-device/",
  travel_booking: "docs/operations/",
  jp_carbon_neutral_2050: "docs/compliance/declarations/",
  jp_women_empowerment: "docs/compliance/declarations/",
  jp_privacy_policy: "docs/compliance/privacy/",
};

const PROPERTY_MODULE_AGENTS = new Set(["rental", "hospitality", "property_management"]);

const CORE_README: Partial<Record<(typeof CORE_DOC_DIRS)[number], string>> = {
  "procurement/quotes/received":
    "# 受領見積\n\nベンダー・相手社から受け取った見積。Zone A（Core）。\n",
  "sales/quotes": "# 提出見積\n\n顧客向けに自社が提出した見積。Zone A（Core）。\n",
  contracts:
    "# 契約書\n\nCTR-XXX/。Zone A。組織間: steward/rules/inter-org-contract-workflow.md\n",
  "io/inbox":
    "# inbox\n\n外部受領。Zone A。組織間契約ドラフトは P2 までここ。\n",
  "io/outbox/sent": "# outbox/sent\n\n送付控え。Zone A。\n",
};

function tenantDocsPath(...parts: string[]): string {
  return join(getTenantDir(), "docs", ...parts);
}

function tenantRecordsPath(...parts: string[]): string {
  return join(getTenantDir(), "records", ...parts);
}

function ensureDirWithReadme(
  absDir: string,
  rel: string,
  readme: string,
  result: ScaffoldResult
): void {
  if (existsSync(absDir)) {
    result.skipped.push(rel);
  } else {
    mkdirSync(absDir, { recursive: true });
    result.created.push(rel);
  }
  const readmePath = join(absDir, "00-このフォルダについて.md");
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, readme, "utf-8");
  }
}

export function coreTenantDocsIndex(tenantId: string): string {
  return `# docs/ — 会社書類（${tenantId}）

**Zone A（Core）** — 全組織共通。拡張は [tenant-document-zones.md](../../../steward/rules/tenant-document-zones.md)

| フォルダ | 用途 |
|----------|------|
| company/ | 法人 · 規程 · 議事録 · 税務 |
| contracts/ | 契約書 |
| procurement/ | 受領見積 · 発注 |
| sales/quotes/ | 提出見積 |
| finance/accounting/ | 請求 · 領収書索引 |
| io/ | 受領 · 送付 |
| legal/ · compliance/ · executive/ | 法務 · コンプライアンス · 秘書 |
| reports/ | Agent 生成物（Zone C） |

**領収書スキャン:** \`records/receipts/\`（テナント直下 · Git 非推跡推奨）
`;
}

export function scaffoldCoreTenantDocs(): ScaffoldResult {
  const result: ScaffoldResult = { created: [], skipped: [] };
  const docsBase = join(getTenantDir(), "docs");
  mkdirSync(docsBase, { recursive: true });

  for (const rel of CORE_DOC_DIRS) {
    const abs = tenantDocsPath(...rel.split("/"));
    const readme =
      CORE_README[rel] ??
      `# ${rel}\n\nZone A（Core）— 全テナント共通。\n\n正本: steward/rules/tenant-document-zones.md\n`;
    ensureDirWithReadme(abs, rel, readme, result);
  }

  const indexPath = join(docsBase, "00-このフォルダについて.md");
  if (!existsSync(indexPath)) {
    const tenantId = getTenantDir().split(/[/\\]/).pop() ?? "tenant";
    writeFileSync(indexPath, coreTenantDocsIndex(tenantId), "utf-8");
    result.created.push("00-このフォルダについて.md");
  }

  const companyIndex = join(docsBase, "company", "00-このフォルダについて.md");
  if (!existsSync(companyIndex)) {
    writeFileSync(
      companyIndex,
      "# company/ — 法人書類\n\nZone A（Core）。regulations · governance · events 等。\n",
      "utf-8"
    );
  }

  const recordsAbs = tenantRecordsPath();
  ensureDirWithReadme(
    recordsAbs,
    "records/",
    "# records — スキャン正本（L2）\n\n領収書: records/receipts/{年}/\nZone A 索引は docs/finance/accounting/templates/\n",
    result
  );

  return result;
}

export function getModuleExtensionPaths(mod: TenantModule): string[] {
  if (!mod.enabled) return [];
  const paths: string[] = [];

  const docsRoot =
    mod.docs_root?.replace(/\/$/, "") ??
    MODULE_DEFAULT_DOCS_ROOT[mod.id]?.replace(/\/$/, "");
  if (docsRoot) {
    paths.push(docsRoot);
    if (PROPERTY_MODULE_AGENTS.has(mod.agent) && docsRoot.includes("/operations")) {
      for (const sub of PROPERTY_OPERATIONS_SUBDIRS) {
        paths.push(`${docsRoot}/${sub}`);
      }
    }
    if (mod.agent === "jp_medical_device") {
      paths.push(`${docsRoot}/qms`, `${docsRoot}/gvp`);
    }
  }

  const dataRoot =
    mod.data_root?.replace(/\/$/, "") ??
    MODULE_DEFAULT_DATA_ROOT[mod.agent]?.replace(/\/$/, "");
  if (dataRoot) {
    paths.push(dataRoot);
  }

  if (mod.summary_dir) {
    const summary = mod.summary_dir.replace(/\/$/, "");
    paths.push(`docs/reports/${summary}`);
  }

  if (mod.operations_public) paths.push(mod.operations_public.replace(/\/$/, ""));

  return [...new Set(paths)];
}

function moduleExtensionReadme(mod: TenantModule, rel: string): string {
  return `# Extension — ${mod.id}

**Zone B** · モジュール \`${mod.id}\`（\`${mod.agent}\`）有効化時に作成。

| 項目 | 値 |
|------|-----|
| docs_root | ${mod.docs_root ?? MODULE_DEFAULT_DOCS_ROOT[mod.id] ?? "—"} |
| data_root | ${mod.data_root ?? MODULE_DEFAULT_DATA_ROOT[mod.agent] ?? "—"} |

正本: steward/rules/tenant-document-zones.md · steward/modules/${mod.id}/
`;
}

export function scaffoldModuleExtensionDocs(moduleId?: string): ScaffoldResult {
  const result: ScaffoldResult = { created: [], skipped: [] };
  const file = loadModulesFile();
  const targets = moduleId
    ? file.modules.filter((m) => m.id === moduleId || m.agent === moduleId)
    : file.modules.filter((m) => m.enabled);

  for (const mod of targets) {
    if (!mod.enabled) continue;
    for (const rel of getModuleExtensionPaths(mod)) {
      const abs = rel.startsWith("docs/")
        ? join(getTenantDir(), ...rel.split("/"))
        : join(getTenantDir(), ...rel.split("/"));
      ensureDirWithReadme(abs, rel, moduleExtensionReadme(mod, rel), result);
    }
  }
  return result;
}

export function scaffoldTenantDocumentZones(opts?: {
  core?: boolean;
  modules?: boolean;
  moduleId?: string;
}): { core: ScaffoldResult; modules: ScaffoldResult } {
  const core = opts?.core !== false ? scaffoldCoreTenantDocs() : { created: [], skipped: [] };
  const modules =
    opts?.modules !== false
      ? scaffoldModuleExtensionDocs(opts?.moduleId)
      : { created: [], skipped: [] };
  return { core, modules };
}
