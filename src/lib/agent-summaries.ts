import type { Contract } from "../../schemas/index.js";
import type { StewardData } from "./data.js";
import { loadAllData } from "./data.js";
import { scanContractAlerts } from "./alerts.js";
import { listPendingInbox, loadDocumentIo } from "./document-io.js";
import {
  computeDashboard,
  buildLiquidityOutlook,
  type DashboardReport,
} from "./dashboard.js";
import { loadEnabledRegulationIds } from "./regulations.js";
import {
  currentDate,
  DOCS_DIR,
  formatCurrency,
  formatPercent,
  writeMarkdownReport,
} from "./utils.js";
import { loadEnabledModules, type TenantModule } from "./modules.js";
import { join } from "node:path";
import { readdirSync, existsSync } from "node:fs";

export const AGENT_SUMMARIES_SUBDIR = "agent-summaries";

export interface ModuleSummaryPath {
  moduleId: string;
  agent: string;
  path: string;
}

export interface AgentSummaryPaths {
  finance: string;
  contract: string;
  compliance: string;
  operations: string;
  executive: string;
  /** 有効モジュールのみ（summary_dir 配下） */
  modules: ModuleSummaryPath[];
  /** @deprecated use modules[] */
  prop001?: string;
  /** @deprecated use modules[] */
  prop002?: string;
}

function summaryFilename(suffix = "dashboard-sync"): string {
  return `${currentDate()}-${suffix}.md`;
}

function reportsRelLink(absPath: string): string {
  const marker = `${DOCS_DIR}/reports/`;
  if (absPath.startsWith(marker)) {
    return `../${absPath.slice(marker.length)}`;
  }
  return absPath;
}

function relDocsPath(absPath: string): string {
  return absPath.replace(`${DOCS_DIR}/`, "docs/");
}

function formatModuleSummaryContent(
  mod: TenantModule,
  data: StewardData,
  report: DashboardReport
): string {
  switch (mod.agent) {
    case "rental":
      return formatRentalModuleSummary(data, report, mod.property_ids ?? []);
    case "hospitality":
      return formatHospitalityModuleSummary(data, report, mod.property_ids ?? []);
    case "professional_services":
      return formatProfessionalServicesSummary(report, mod);
    case "venture_capital":
      return formatVentureCapitalSummary(report, mod);
    default:
      return `# Module ${mod.id} 要約 ${report.reportDate}\n`;
  }
}

function moduleSummarySubdir(mod: TenantModule): string {
  return mod.summary_dir ?? `agent-summaries/${mod.id}`;
}

function draftContracts(contracts: Contract[]): Contract[] {
  return contracts.filter((c) => c.status === "draft");
}

function executedCount(contracts: Contract[]): number {
  return contracts.filter((c) => c.status === "executed").length;
}

export function formatFinanceSummary(report: DashboardReport): string {
  const cf = report.cashFlow;
  const liquidity = buildLiquidityOutlook(cf);
  return [
    `# Finance Agent 要約 ${report.reportDate}`,
    "",
    "## 結論",
    "",
    `- **${report.fiscalYear}** 月次売上 ${formatCurrency(cf.monthlyRevenue)}（${cf.basisMonth} · ${cf.source}）`,
    `- 月次利益（営業近似）${formatCurrency(cf.monthlyProfit)} · ${liquidity.netCashFlowLabel} ${liquidity.netCashFlowValue}`,
    `- ${liquidity.primaryLabel}: ${liquidity.primaryValue}${liquidity.primaryValue === "TBD" ? "（cash-balance.yaml 未確定）" : ""}`,
    "",
    "## KPI / 状態",
    "",
    "| 指標 | 値 |",
    "|------|---:|",
    `| 固定費/月 | ${formatCurrency(cf.fixedCosts)} |`,
    `| 変動費/月 | ${formatCurrency(cf.variableCosts)} |`,
    `| 損益分岐売上 | ${cf.breakEvenRevenue ? formatCurrency(cf.breakEvenRevenue) : "—"} |`,
    `| ${report.fiscalYear} 純利益（予実） | ${report.kpis.find((k) => k.id === "fy_net_profit")?.value ?? "—"} |`,
    "",
    "## リスク・P0",
    "",
    ...report.tbdItems
      .filter((t) => t.includes("現預金") || t.includes("返済"))
      .map((t) => `- ${t}`),
    ...(cf.notes.length ? cf.notes.map((n) => `- ${n}`) : ["- 特になし"]),
    "",
    "## 推奨アクション",
    "",
    "1. `cash-balance.yaml` に残高入力 → `status: confirmed` → `npm run validate`",
    "2. 月次 YAML 更新時は `steward deps check` → `validate` → `sync all`",
    "",
    "## 根拠",
    "",
    "- `data/finance/` · `data/plans/`",
    "- Skill: [steward/skills/cashflow_forecast.md](../../../steward/skills/cashflow_forecast.md)",
    "",
    `*生成: steward dashboard · ${report.generatedAt}*`,
  ].join("\n");
}

export function formatContractSummary(data: StewardData, report: DashboardReport): string {
  const drafts = draftContracts(data.contracts);
  const alerts = scanContractAlerts(data.contracts, 90);
  const insuranceDrafts = drafts.filter((c) => c.type === "insurance");

  return [
    `# Contract Agent 要約 ${report.reportDate}`,
    "",
    "## 結論",
    "",
    `- 契約 **${executedCount(data.contracts)}/${data.contracts.length}** executed`,
    `- **draft ${drafts.length} 件**（P0 保険 ${insuranceDrafts.length} 件）`,
    `- 90 日以内期限アラート **${alerts.length} 件**`,
    "",
    "## KPI / 状態",
    "",
    "| ID | 名称 | 状態 | 物件 |",
    "|----|------|------|------|",
    ...drafts.map(
      (c) => `| ${c.id} | ${c.name} | draft | ${c.property_id ?? "—"} |`
    ),
    ...(drafts.length === 0 ? ["| — | draft なし | — | — |"] : []),
    "",
    "## リスク・P0",
    "",
    ...insuranceDrafts.map((c) => `- **${c.id}** ${c.name} — 未加入`),
    ...drafts
      .filter((c) => c.type !== "insurance")
      .map((c) => `- ${c.id} ${c.name}（draft）`),
    "",
    "## 推奨アクション",
    "",
    "1. draft 契約の締結 · 証券 inbox 归档",
    "2. `npm run steward -- alerts` で期限確認",
    "",
    "## 根拠",
    "",
    "- `data/contracts/`",
    "- Skill: [steward/skills/contract_expiry_check.md](../../../steward/skills/contract_expiry_check.md)",
    "",
    `*生成: steward dashboard · ${report.generatedAt}*`,
  ].join("\n");
}

export function formatRentalModuleSummary(
  data: StewardData,
  report: DashboardReport,
  propertyIds: string[]
): string {
  const propId = propertyIds[0];
  if (!propId) {
    return `# Rental Module 要約 ${report.reportDate}\n\nproperty_ids 未設定。\n`;
  }
  const p = data.properties.find((x) => x.id === propId);
  if (!p || p.type !== "rental") {
    return `# Rental Module 要約 ${report.reportDate}\n\n${propId} 未找到または type≠rental。\n`;
  }
  const rental = p.rental!;
  const annualRent = rental.monthly_rent * 12 * (1 - rental.vacancy_rate);
  const noiApprox = annualRent - (p.depreciation?.annual_amount ?? 0);

  return [
    `# Rental Module Agent 要約 ${report.reportDate}`,
    "",
    "## 結論",
    "",
    `- **${p.name}**（${propId}）月額賃料 ${formatCurrency(rental.monthly_rent)} · 空室率 ${formatPercent(rental.vacancy_rate)}`,
    `- 年間賃料収入（概算）${formatCurrency(annualRent)} · NOI 近似 ${formatCurrency(noiApprox)}（減価除く前）`,
    "",
    "## KPI / 状態",
    "",
    "| 項目 | 値 |",
    "|------|---:|",
    `| 取得価格 | ${formatCurrency(p.acquisition_price)} |`,
    `| 減価償却/年 | ${formatCurrency(p.depreciation?.annual_amount ?? 0)} |`,
    "",
    "## 根拠",
    "",
    `- data/properties/${propId}.yaml`,
    "- Skill: [steward/modules/rental/skills/noi_analysis.md](../../../steward/modules/rental/skills/noi_analysis.md)",
    "",
    `*生成: steward dashboard · ${report.generatedAt}*`,
  ].join("\n");
}

/** @deprecated use formatRentalModuleSummary with module.property_ids */
export function formatProp001Summary(data: StewardData, report: DashboardReport): string {
  const mod = loadEnabledModules().find((m) => m.agent === "rental");
  return formatRentalModuleSummary(data, report, mod?.property_ids ?? []);
}

export function formatHospitalityModuleSummary(
  data: StewardData,
  report: DashboardReport,
  propertyIds: string[]
): string {
  const propId = propertyIds[0];
  if (!propId) {
    return `# Hospitality Module 要約 ${report.reportDate}\n\nproperty_ids 未設定。\n`;
  }
  const p = data.properties.find((x) => x.id === propId);
  if (!p || p.type !== "hotel") {
    return `# Hospitality Module 要約 ${report.reportDate}\n\n${propId} 未找到または type≠hotel。\n`;
  }
  const h = p.hotel!;
  const oc = p.operating_costs;
  const daysPerMonth = 30 * h.occupancy_rate;
  const monthlyGross = h.adr * daysPerMonth;
  const revpar = h.adr * h.occupancy_rate;

  return [
    `# Hospitality Module Agent 要約 ${report.reportDate}`,
    "",
    "## 結論",
    "",
    `- **${p.name}**（${propId}）開業予定 ${h.opened_date ?? "TBD"}`,
    `- 計画 ADR ${formatCurrency(h.adr)} · 稼働率 ${formatPercent(h.occupancy_rate)} · RevPAR ${formatCurrency(revpar)}`,
    `- 月次売上見込 ${formatCurrency(monthlyGross)}`,
    "",
    "## 根拠",
    "",
    `- data/properties/${propId}.yaml`,
    "- Skill: [steward/modules/hospitality/skills/revpar_analysis.md](../../../steward/modules/hospitality/skills/revpar_analysis.md)",
    "",
    `*生成: steward dashboard · ${report.generatedAt}*`,
  ].join("\n");
}

/** @deprecated use formatHospitalityModuleSummary with module.property_ids */
export function formatProp002Summary(data: StewardData, report: DashboardReport): string {
  const mod = loadEnabledModules().find((m) => m.agent === "hospitality");
  return formatHospitalityModuleSummary(data, report, mod?.property_ids ?? []);
}

export function formatProfessionalServicesSummary(
  report: DashboardReport,
  mod: TenantModule
): string {
  return [
    `# Professional Services Module 要約 ${report.reportDate}`,
    "",
    "## 結論",
    "",
    `- モジュール **${mod.id}** · data_root: \`${mod.data_root ?? "—"}\``,
    "- 案件 YAML は Phase C 雛形（`data/services/` 等を整備）",
    "",
    "## 推奨アクション",
    "",
    "1. `data_root` 配下に案件 SoT を整備",
    "2. 業務委託 CTR と STK 索引を Contract Agent と整合",
    "",
    `*生成: steward dashboard · ${report.generatedAt}*`,
  ].join("\n");
}

export function formatVentureCapitalSummary(
  report: DashboardReport,
  mod: TenantModule
): string {
  return [
    `# Venture Capital Module 要約 ${report.reportDate}`,
    "",
    "## 結論",
    "",
    `- モジュール **${mod.id}** · data_root: \`${mod.data_root ?? "—"}\``,
    "- ファンド · ポートフォリオは `funds.yaml` · `portfolio.yaml`（`.example` 参照）",
    "",
    "## 推奨アクション",
    "",
    "1. `portfolio_review` Skill で四半期レビュー",
    "2. LP 報告前に Finance · Compliance と整合",
    "",
    "- Skill: [steward/modules/venture_capital/skills/portfolio_review.md](../../../steward/modules/venture_capital/skills/portfolio_review.md)",
    "",
    `*生成: steward dashboard · ${report.generatedAt}*`,
  ].join("\n");
}

export function formatComplianceSummary(data: StewardData, report: DashboardReport): string {
  const insuranceDrafts = data.contracts.filter(
    (c) => c.status === "draft" && c.type === "insurance"
  );
  const enabledRegs = loadEnabledRegulationIds();

  return [
    `# Compliance Agent 要約 ${report.reportDate}`,
    "",
    "## 結論",
    "",
    `- 有効社内規程 **${enabledRegs.length} 件**: ${enabledRegs.join(", ") || "（なし）"}`,
    `- 保険 CTR draft **${insuranceDrafts.length} 件** — コンプライアンス P0`,
    "- ISO 9001: L2（記録様式整備 · 初回監査未実施）",
    "",
    "## KPI / 状態",
    "",
    "| 領域 | 状態 |",
    "|------|------|",
    "| 旅館業法 / 許認可 | `docs/company/licenses/` 要確認 |",
    "| 個情 | REG-010 · privacy テンプレ |",
    "| 保険 | CTR-013/014 draft |",
    "",
    "## リスク・P0",
    "",
    ...insuranceDrafts.map((c) => `- ${c.id} ${c.name} 未加入`),
    "- B/S TBD — 税務届出ブロッカー（Finance 連携）",
    "",
    "## 推奨アクション",
    "",
    "1. 保険証券取得 · licenses INDEX 更新",
    "2. `permit_expiry_check` Skill 定期実行",
    "",
    "## 根拠",
    "",
    "- `regulations.yaml` · `docs/company/regulations/`（有効 REG のみ）",
    "- `docs/compliance/iso/` · `steward/standards/iso/`",
    "- Skill: [steward/skills/permit_expiry_check.md](../../../steward/skills/permit_expiry_check.md)",
    "",
    `*生成: steward dashboard · ${report.generatedAt}*`,
  ].join("\n");
}

export function formatOperationsSummary(report: DashboardReport): string {
  const inbox = listPendingInbox();
  const io = loadDocumentIo();
  const outboxCount = io.outbox_items.length;

  return [
    `# Operations Agent 要約 ${report.reportDate}`,
    "",
    "## 結論",
    "",
    `- inbox 未処理 **${inbox.length} 件**`,
    `- outbox 登録 **${outboxCount} 件**（document-io.yaml）`,
    "- I/O 台帳運用中",
    "",
    "## KPI / 状態",
    "",
    "| キュー | 件数 |",
    "|--------|---:|",
    `| inbox pending | ${inbox.length} |`,
    `| outbox | ${outboxCount} |`,
    "",
    ...(inbox.length
      ? ["## 未処理 inbox", "", ...inbox.map((i) => `- ${i.id}: ${i.title}`), ""]
      : []),
    "## リスク・P0",
    "",
    ...(inbox.length > 0
      ? ["- inbox 滞留 — 48h 以内分類"]
      : ["- inbox 空 — 正常"]),
    "- 保険証券スキャン受信時は Contract へ路由",
    "",
    "## 推奨アクション",
    "",
    "1. `npm run steward -- io status`",
    "2. 証券 PDF → `io inbox add` → Contract 归档",
    "",
    "## 根拠",
    "",
    "- `data/document-io.yaml` · `docs/io/inbox/` · `docs/io/outbox/`",
    "",
    `*生成: steward dashboard · ${report.generatedAt}*`,
  ].join("\n");
}

export function formatExecutiveSummary(
  report: DashboardReport,
  paths: Omit<AgentSummaryPaths, "executive">
): string {
  const p0Tasks = report.highUrgencyTasks.filter((t) => t.importance === "high").slice(0, 5);
  const cf = report.cashFlow;
  const liquidity = buildLiquidityOutlook(cf);

  return [
    `# Executive Steward 要約 ${report.reportDate}`,
    "",
    "## 結論",
    "",
    `- **${report.companyName}** ${report.fiscalYear} — 経営判断材料を Agent 要約から統合`,
    `- ${liquidity.primaryLabel} ${liquidity.primaryValue} · 月次利益 ${formatCurrency(cf.monthlyProfit)}`,
    `- P0 / 高優先タスク **${p0Tasks.length} 件**`,
    "",
    "## KPI スナップショット",
    "",
    "| 指標 | 値 |",
    "|------|---:|",
    ...report.kpis.slice(0, 6).map((k) => `| ${k.label} | ${k.value} |`),
    "",
    "## 今日の判断が必要な項目",
    "",
    ...(p0Tasks.length
      ? p0Tasks.map((t, i) => `${i + 1}. **${t.id}** ${t.title}`)
      : ["1. P0 タスクなし — 計画通り"]),
    "",
    "## Agent 要約（読取面）",
    "",
    "| Agent | ファイル |",
    "|-------|---------|",
    `| Finance | [${relDocsPath(paths.finance).split("/").pop()}](${reportsRelLink(paths.finance)}) |`,
    `| Contract | [${relDocsPath(paths.contract).split("/").pop()}](${reportsRelLink(paths.contract)}) |`,
    ...paths.modules.map((m) => {
      const label = m.agent.replace(/_/g, " ");
      return `| ${label} (${m.moduleId}) | [${relDocsPath(m.path).split("/").pop()}](${reportsRelLink(m.path)}) |`;
    }),
    `| Compliance | [${relDocsPath(paths.compliance).split("/").pop()}](${reportsRelLink(paths.compliance)}) |`,
    `| Operations | [${relDocsPath(paths.operations).split("/").pop()}](${reportsRelLink(paths.operations)}) |`,
    "",
    "## リスク・注意",
    "",
    ...report.tbdItems.map((t) => `- ${t}`),
    "",
    "## 推奨 CLI",
    "",
    "```bash",
    "npm run steward -- dashboard",
    "npm run steward -- alerts",
    "npm run steward -- status",
    "```",
    "",
    `*生成: steward dashboard · ${report.generatedAt}*`,
  ].join("\n");
}

export function writeAgentSummaries(
  report?: DashboardReport,
  data?: StewardData
): AgentSummaryPaths {
  const d = data ?? loadAllData();
  const r = report ?? computeDashboard(d);
  const filename = summaryFilename();

  const financePath = writeMarkdownReport(
    `${AGENT_SUMMARIES_SUBDIR}/finance`,
    filename,
    formatFinanceSummary(r)
  );
  const contractPath = writeMarkdownReport(
    `${AGENT_SUMMARIES_SUBDIR}/contract`,
    filename,
    formatContractSummary(d, r)
  );

  const modulePaths: ModuleSummaryPath[] = [];
  const enabledModules = loadEnabledModules();
  for (const mod of enabledModules) {
    const path = writeMarkdownReport(
      moduleSummarySubdir(mod),
      filename,
      formatModuleSummaryContent(mod, d, r)
    );
    modulePaths.push({ moduleId: mod.id, agent: mod.agent, path });
  }

  const compliancePath = writeMarkdownReport(
    `${AGENT_SUMMARIES_SUBDIR}/compliance`,
    filename,
    formatComplianceSummary(d, r)
  );
  const operationsPath = writeMarkdownReport(
    `${AGENT_SUMMARIES_SUBDIR}/operations`,
    filename,
    formatOperationsSummary(r)
  );

  const partialPaths = {
    finance: financePath,
    contract: contractPath,
    modules: modulePaths,
    prop001: modulePaths.find((m) => m.agent === "rental")?.path,
    prop002: modulePaths.find((m) => m.agent === "hospitality")?.path,
    compliance: compliancePath,
    operations: operationsPath,
  };

  const executivePath = writeMarkdownReport(
    "executive-notes",
    filename,
    formatExecutiveSummary(r, partialPaths)
  );

  return { ...partialPaths, executive: executivePath };
}

/** 最新の dashboard-sync 要約パス（存在しなければ undefined） */
export function findLatestAgentSummaries(): Partial<AgentSummaryPaths> | null {
  const result: Partial<AgentSummaryPaths> = {};
  let any = false;

  for (const key of ["finance", "contract", "compliance", "operations"] as const) {
    const dir = join(DOCS_DIR, "reports", AGENT_SUMMARIES_SUBDIR, key);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md") && f.includes("dashboard-sync"))
      .sort()
      .reverse();
    if (files[0]) {
      result[key] = join(dir, files[0]);
      any = true;
    }
  }

  for (const mod of loadEnabledModules()) {
    const sub = mod.summary_dir ?? `agent-summaries/${mod.id}`;
    const dir = join(DOCS_DIR, "reports", sub);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md") && f.includes("dashboard-sync"))
      .sort()
      .reverse();
    if (!files[0]) continue;
    const entry: ModuleSummaryPath = {
      moduleId: mod.id,
      agent: mod.agent,
      path: join(dir, files[0]),
    };
    if (!result.modules) result.modules = [];
    result.modules.push(entry);
    if (mod.agent === "rental") result.prop001 = entry.path;
    if (mod.agent === "hospitality") result.prop002 = entry.path;
    any = true;
  }

  const execDir = join(DOCS_DIR, "reports", "executive-notes");
  if (existsSync(execDir)) {
    const execFiles = readdirSync(execDir)
      .filter((f) => f.endsWith(".md") && f.includes("dashboard-sync"))
      .sort()
      .reverse();
    if (execFiles[0]) {
      result.executive = join(execDir, execFiles[0]);
      any = true;
    }
  }

  return any ? result : null;
}

export function formatAgentSummariesSection(paths: Partial<AgentSummaryPaths>): string {
  const moduleRows: [string, string][] = (paths.modules ?? []).map((m) => [
    `${m.agent} (${m.moduleId})`,
    m.path,
  ]);
  const rows: [string, string | undefined][] = [
    ["Finance", paths.finance],
    ["Contract", paths.contract],
    ...moduleRows,
    ["Compliance", paths.compliance],
    ["Operations", paths.operations],
    ["Executive", paths.executive],
  ].filter(([, p]) => p) as [string, string][];

  const lines = [
    "## Agent 要約（Steward 読取面）",
    "",
    "各 Agent の最新要約。詳細 Data は Agent 経由で参照。",
    "",
    "| Agent | 要約ファイル |",
    "|-------|-------------|",
    ...rows.map(([name, p]) => {
      const rel = relDocsPath(p);
      return `| ${name} | [${rel.split("/").pop()}](${reportsRelLink(p)}) |`;
    }),
    "",
    "**Secretary（秘書）** は Steward 読取面外。予定・1-on-1 → [docs/executive/](../../executive/00-このフォルダについて.md) · `@steward/agents/secretary_agent.md`",
    "",
    "Agent 一覧: [steward/agents/](../agents/00-このフォルダについて.md) · 業務モジュール: [steward/modules/](../modules/00-このフォルダについて.md)",
    "",
    "索引: [agent-summaries/00-このフォルダについて.md](../agent-summaries/00-このフォルダについて.md)",
    "",
  ];
  return lines.join("\n");
}
