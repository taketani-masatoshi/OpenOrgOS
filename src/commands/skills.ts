import {
  getCliSkills,
  getCursorOnlySkills,
  getSkillById,
  loadSkillRegistry,
  validateSkillRegistryFiles,
} from "../lib/skill-registry.js";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runClassificationCheck } from "./classification.js";
import { getInstallRoot } from "../lib/orgos-paths.js";
import { runAlerts } from "./alerts.js";
import { runOpsP0, runOpsDaily } from "./ops.js";
import { runPermitExpiryCheck, formatPermitCheckReport } from "../lib/permit-check.js";
import { computeVarianceReport, formatVarianceMarkdown } from "../lib/variance.js";
import { runAnalyzeProperty } from "./analyze.js";
import { loadMonthlyFinance } from "../lib/data.js";
import { runDashboard } from "./dashboard.js";
import { runForecast } from "./forecast.js";
import { runHrHeadcount, runHrOnboard } from "./hr.js";
import {
  runPmoMilestones,
  runPmoPortfolio,
  runPmoRisks,
  runPmoShow,
} from "./pmo.js";
import {
  runAnalyticsKpi,
  runAnalyticsMetrics,
  runAnalyticsQuality,
} from "./analytics.js";
import { currentDate, readYamlFile, writeMarkdownReport, getExecutiveDir } from "../lib/utils.js";
import {
  runCorrespondenceSendSkill,
  runSlackNotifySkill,
  runCorrespondenceDraft,
  runCorrespondenceCompose,
} from "./secretary-correspondence.js";
import {
  formatControlStatusReport,
  computeControlGaps,
  controlsForAgent,
} from "../lib/control-framework.js";
import {
  formatChainVerifyReport,
  runMonthlyCompanyEventsAudit,
  runWeeklyCompanyEventsAttestation,
} from "../lib/company-events-attestation.js";
import { runExpenseClaimList } from "./expense-claim.js";
import { runFinancesClose } from "./finances-close.js";
import {
  runLedgerExport,
  runLedgerMonthlyReconcile,
  runLedgerPostSource,
  runLedgerTrialBalance,
} from "./ledger.js";
import {
  runTaxConsumptionCalc,
  runTaxDepreciation,
} from "./tax.js";
import { calendarFileSchema, oneOnOnesFileSchema } from "../../schemas/executive.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";
import {
  runCapexPlanningSkill,
  runContractRegisterSkill,
  runTaxFilingPrepSkill,
} from "../lib/core-skill-runners.js";
import { getModuleSkillHandlers } from "../lib/module-cli.js";
import {
  resolveSkillInvocation,
  type SkillHandler,
  type SkillInvocationResolution,
} from "../lib/skill-invocation.js";
import { runWithFsGuardAgentAsync } from "../lib/org/fs-guard/index.js";
import { resolveSkillFsGuardAgentById } from "../lib/org/fs-guard/skill-agent-context.js";
import {
  buildSalesForecastView,
  buildSalesPipelineView,
  formatSalesForecastMarkdown,
  formatSalesPipelineMarkdown,
} from "../lib/sales-pipeline-view.js";
import {
  buildCustomerSuccessView,
  formatCustomerSuccessMarkdown,
} from "../lib/customer-success-view.js";
import {
  buildSalesInboundView,
  formatSalesInboundMarkdown,
} from "../lib/sales-inbound-view.js";
import {
  buildSalesOutboundView,
  formatSalesOutboundMarkdown,
} from "../lib/sales-outbound-view.js";
import {
  runTreasuryCashPositionSkill,
  runTreasuryLiquidityForecastSkill,
} from "../lib/finance/treasury-skill-runners.js";
import {
  runGovernanceMeetingPrepSkill,
  runGovernanceRegisterReviewSkill,
  runPrivacyDataInventorySkill,
  runPrivacyImpactReviewSkill,
  runProcurementOrderReviewSkill,
  runProcurementVendorEvalSkill,
  runRiskInsuranceRenewalSkill,
  runRiskRegisterReviewSkill,
} from "../lib/extension-skill-runners.js";
import { runScheduleCoordinationSkill } from "./scheduling-coordination.js";

const SKILLS_ALWAYS_WRITE = new Set([
  "dashboard",
  "iso-control-review",
  "internal-audit-scope",
  "iso-internal-audit-run",
  "company-events-chain-verify",
  "company-events-weekly-attest",
  "company-events-monthly-audit",
]);

const SKILLS_OUTPUT_WRITE = new Set([
  "contract-expiry",
  "permit-expiry",
  "variance",
  "forecast",
  "tax-filing-prep",
  "contract-register",
  "capex-planning",
  "sales-pipeline",
  "sales-forecast",
  "sales-inbound",
  "sales-outbound",
  "cs-health",
  "cs-renewal",
]);

function ensureSkillWriteAuth(id: string, opts: SkillRunOptions): void {
  if (SKILLS_ALWAYS_WRITE.has(id) || (SKILLS_OUTPUT_WRITE.has(id) && opts.output)) {
    requireCliReportWrite(`skills run ${id}`);
  }
}

export const SKILL_COMMANDS = [
  {
    id: "contract-expiry",
    skill: "contract_expiry_check",
    agent: "Contract",
    description: "契約期限アラート（90日）",
  },
  {
    id: "permit-expiry",
    skill: "permit_expiry_check",
    agent: "Compliance",
    description: "許認可 · 保険 INDEX · draft CTR",
  },
  {
    id: "iso-control-review",
    skill: "iso_control_review",
    agent: "Compliance",
    description: "ISO × REG 統制ギャップ · 成熟度",
  },
  {
    id: "internal-audit-scope",
    skill: "internal_audit_scope",
    agent: "Internal Audit",
    description: "CTL ベース内部監査スコープ",
  },
  {
    id: "iso-internal-audit-run",
    skill: "iso_internal_audit_run",
    agent: "Internal Audit",
    description: "有効 ISO の control-map を検査し監査ログを追記",
  },
  {
    id: "iso-internal-audit-report",
    skill: "iso_internal_audit_report",
    agent: "Internal Audit",
    description: "監査ログから経営向け適合レポート",
  },
  {
    id: "iso-audit-brief",
    skill: "iso_audit_brief",
    agent: "Internal Audit",
    description: "要求事項の言い換えと事前検査ギャップの解説（判定しない）",
  },
  {
    id: "iso-audit-follow-up",
    skill: "iso_audit_follow_up",
    agent: "Internal Audit",
    description: "不適合のフォローアップと是正の有効性",
  },
  {
    id: "company-events-chain-verify",
    skill: "company_events_chain_verify",
    agent: "Records Audit",
    description: "会社イベントハッシュチェーン整合検証",
  },
  {
    id: "company-events-weekly-attest",
    skill: "company_events_weekly_attest",
    agent: "Records Audit",
    description: "週次 — チェーン検証後バッチ電子署名",
  },
  {
    id: "company-events-monthly-audit",
    skill: "company_events_monthly_audit",
    agent: "Records Audit",
    description: "月次監査レポート + 人間通知",
  },
  {
    id: "monthly-close",
    skill: "monthly_close",
    agent: "Finance",
    description: "月次締めサマリ（指定月）",
  },
  {
    id: "variance",
    skill: "variance_analysis",
    agent: "Finance",
    description: "予実 vs 月次 YAML 差異",
  },
  {
    id: "noi-analysis",
    skill: "noi_analysis",
    agent: "Finance",
    description: "物件別 NOI（賃料収入 − 運営費）",
  },
  {
    id: "journal-post",
    skill: "journal_post",
    agent: "Accounting",
    description: "仕訳起票",
  },
  {
    id: "trial-balance",
    skill: "trial_balance",
    agent: "Accounting",
    description: "試算表・月次突合",
  },
  {
    id: "journal-export-csv",
    skill: "journal_export_csv",
    agent: "Accounting",
    description: "仕訳 YAML → CSV ミラー",
  },
  {
    id: "trial-balance-export-csv",
    skill: "trial_balance_export_csv",
    agent: "Accounting",
    description: "試算表 → CSV ミラー",
  },
  {
    id: "depreciation-run",
    skill: "depreciation_run",
    agent: "Accounting",
    description: "減価償却検算と仕訳",
  },
  {
    id: "consumption-tax-calc",
    skill: "consumption_tax_calc",
    agent: "Tax",
    description: "消費税集計",
  },
  {
    id: "payroll-calc",
    skill: "payroll_calc",
    agent: "Human Resources",
    description: "給与計算サマリ",
  },
  {
    id: "annual-close",
    skill: "annual_close",
    agent: "Accounting",
    description: "年次決算",
  },
  {
    id: "records-check",
    skill: "operations_records",
    agent: "Operations",
    description: "宿泊 · 清掃 · クレーム記録の蓄積確認",
  },
  {
    id: "expense-claim",
    skill: "expense_claim_ops",
    agent: "Accounting",
    description: "経費精算一覧（取込・承認は CLI + HumanApproval）",
  },
  {
    id: "p0",
    skill: "p0_closing",
    agent: "Executive",
    description: "P0 決算前ブロッカー",
  },
  {
    id: "daily",
    skill: "daily_ops",
    agent: "Executive",
    description: "日次運用（成熟度 + P0 + 契約）",
  },
  {
    id: "dashboard",
    skill: "executive_dashboard",
    agent: "Executive Steward",
    description: "経営ダッシュボード + Agent 要約",
  },
  {
    id: "forecast",
    skill: "cashflow_forecast",
    agent: "Finance",
    description: "キャッシュフロー予測",
  },
  {
    id: "change-plan",
    skill: "change_plan",
    agent: "Operations",
    description: "等級付き変更提案（ローカル LLM ゲート）",
  },
  {
    id: "change-apply",
    skill: "change_apply",
    agent: "Operations",
    description: "変更提案の dry-run / apply",
  },
  {
    id: "hr-headcount",
    skill: "hr_headcount",
    agent: "Human Resources",
    description: "在籍人員 L1 集計（氏名非出力）",
  },
  {
    id: "hr-onboard",
    skill: "hr_onboard",
    agent: "Human Resources",
    description: "入社 L1 名簿追記 + Work Order",
  },
  {
    id: "pmo-portfolio",
    skill: "pmo_portfolio",
    agent: "PMO",
    description: "案件ポートフォリオ · RAG 集計",
  },
  {
    id: "pmo-milestones",
    skill: "pm_milestone_tracking",
    agent: "PMO",
    description: "マイルストーン期限超過 · 間近",
  },
  {
    id: "pmo-risks",
    skill: "pmo_risks",
    agent: "PMO",
    description: "open リスク一覧",
  },
  {
    id: "pmo-show",
    skill: "pmo_show",
    agent: "PMO",
    description: "1 案件（リンク id のみ）",
  },
  {
    id: "analytics-kpi",
    skill: "analytics_kpi_scorecard",
    agent: "Data Analytics",
    description: "KPI スコアカード（目標 vs 実績 · RAG）",
  },
  {
    id: "analytics-metrics",
    skill: "analytics_metric_catalog",
    agent: "Data Analytics",
    description: "メトリクス定義一覧",
  },
  {
    id: "analytics-quality",
    skill: "analytics_data_quality",
    agent: "Data Analytics",
    description: "データ品質レポート",
  },
  {
    id: "tenant-config-propose",
    skill: "tenant_config_propose",
    agent: "Executive Steward",
    description: "modules/standards 有効化の承認付き提案",
  },
  {
    id: "revpar",
    skill: "revpar_analysis",
    agent: "Hospitality",
    description: "宿泊 RevPAR 要約（hospitality モジュール）",
  },
  {
    id: "schedule",
    skill: "schedule_management",
    agent: "Secretary",
    description: "社長カレンダー件数サマリ",
  },
  {
    id: "schedule-coordination",
    skill: "schedule_coordination",
    agent: "Secretary",
    description: "多者日程調整案件サマリ",
  },
  {
    id: "one-on-one",
    skill: "one_on_one_prep",
    agent: "Secretary",
    description: "1-on-1 レジストリサマリ",
  },
  {
    id: "tax-filing-prep",
    skill: "tax_filing_prep",
    agent: "Tax",
    description: "税務申告準備 — 正データ存在チェック",
  },
  {
    id: "contract-register",
    skill: "contract_register",
    agent: "Contract",
    description: "契約台帳サマリ",
  },
  {
    id: "capex-planning",
    skill: "capex_planning",
    agent: "Finance",
    description: "CAPEX 計画サマリ",
  },
  {
    id: "correspondence-send",
    skill: "correspondence_send",
    agent: "Mail Outbound",
    description: "承認済み対外メール送信（SMTP）",
  },
  {
    id: "slack-notify",
    skill: "slack_notify",
    agent: "Mail Outbound",
    description: "承認済み Slack 通知（webhook）",
  },
  {
    id: "correspondence-draft",
    skill: "correspondence_draft",
    agent: "Mail Outbound",
    description: "対外連絡下書き + 承認起案",
  },
  {
    id: "correspondence-compose",
    skill: "correspondence_compose",
    agent: "Mail Outbound",
    description: "事実パック + LLM 返信下書き（送信しない）",
  },
  {
    id: "mail-intake-triage",
    skill: "mail_intake_triage",
    agent: "Mail Intake",
    description: "受信メールルール分類",
  },
  {
    id: "tenant-integrations-setup",
    skill: "tenant_integrations_setup",
    agent: "Setup",
    description: "テナント integrations 初回設定",
  },
  {
    id: "platform-implement-guide",
    skill: "platform_implement_guide",
    agent: "Platform Guide",
    description: "Agent/Skill/CLI/Module/Wire 実装チェックリスト",
  },
  {
    id: "validate",
    skill: "workspace_validate",
    agent: "Executive Steward",
    description: "テナント YAML 検証（read-only）",
  },
  {
    id: "doctor",
    skill: "workspace_doctor",
    agent: "Executive Steward",
    description: "インストール・本番ゲート診断",
  },
  {
    id: "deps-check",
    skill: "deps_check",
    agent: "Operations",
    description: "依存グラフ整合チェック",
  },
  {
    id: "integrations-status",
    skill: "integrations_status",
    agent: "Setup",
    description: "外部連携ステータス",
  },
  {
    id: "integration-brief",
    skill: "integration_brief",
    agent: "Integration",
    description: "未読 module-message ブリーフ",
  },
  {
    id: "agent-pulse",
    skill: "agent_pulse_summary",
    agent: "Executive Steward",
    description: "Agent pulse サマリ",
  },
  {
    id: "escalate-run",
    skill: "escalate_work_order",
    agent: "Executive Steward",
    description: "Work Order 起票",
  },
  {
    id: "orchestration-status",
    skill: "orchestration_status",
    agent: "Executive Steward",
    description: "オーケストレーション DAG 進捗",
  },
  {
    id: "sales-pipeline",
    skill: "sales_pipeline_review",
    agent: "Sales Lead",
    description: "営業パイプライン分析（件数 · 加重 · アラート）",
  },
  {
    id: "sales-forecast",
    skill: "sales_forecast_prep",
    agent: "Sales Lead",
    description: "受注予測（対象月クローズ想定）",
  },
  {
    id: "sales-inbound",
    skill: "sales_inbound_triage",
    agent: "Sales Inbound",
    description: "インバウンド問合せトリアージ（件数 · SLA · アラート）",
  },
  {
    id: "sales-outbound",
    skill: "sales_outbound_list_review",
    agent: "Sales Outbound",
    description: "アウトバウンドリスト精査（件数 · 接触率 · アラート）",
  },
  {
    id: "cs-health",
    skill: "cs_health_check",
    agent: "Customer Success",
    description: "顧客ヘルススコア · drift 検出",
  },
  {
    id: "cs-renewal",
    skill: "cs_renewal_risk",
    agent: "Customer Success",
    description: "更新期日リスク（horizon 内顧客）",
  },
  {
    id: "classification-check",
    skill: "security_classification_audit",
    agent: "Security",
    description: "分類 registry · AI 境界監査",
  },
  {
    id: "platform-registry-verify",
    skill: "engineering_standards_check",
    agent: "Engineering",
    description: "platform registry 整合検証",
  },
  {
    id: "cto-tech-radar",
    skill: "cto_tech_radar",
    agent: "CTO",
    description: "ADR インベントリ · 技術負債スキャン",
  },
] as const;

function runCtoTechRadarSkill(opts: SkillRunOptions): void {
  const adrDir = join(getInstallRoot(), "docs/adr");
  const files = readdirSync(adrDir)
    .filter((f) => /^\d{4}-.+\.md$/.test(f))
    .sort();
  const lines = [
    "# Tech Radar — ADR Inventory",
    "",
    `**Date:** ${currentDate()}`,
    `**Count:** ${files.length}`,
    "",
    "| ADR | Title |",
    "|-----|-------|",
  ];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const title = id.replace(/^\d{4}-/, "").replace(/-/g, " ");
    lines.push(`| ${id} | ${title} |`);
  }
  lines.push("");
  const md = lines.join("\n");
  if (opts.output) {
    const path = writeMarkdownReport(
      "agent-summaries/cto",
      opts.output ?? `tech-radar-${currentDate()}.md`,
      md,
    );
    console.log(`✓ ${path}`);
  } else if (opts.json) {
    console.log(JSON.stringify({ count: files.length, adrs: files }, null, 2));
  } else {
    console.log(md);
  }
}

export function runSkillsList(): void {
  const issues = validateSkillRegistryFiles();
  if (issues.length) {
    console.warn("Skill registry warnings:");
    for (const i of issues) console.warn(`  ${i}`);
  }

  console.log("Skill registry（steward/core/skills/registry.yaml + modules/*/skills/registry.yaml）:\n");
  console.log("| runtime | id | cli | Agent |");
  console.log("|---------|-----|-----|-------|");
  for (const s of loadSkillRegistry()) {
    const cli = s.cli_command ? `skills run ${s.cli_command}` : "—";
    console.log(`| ${s.runtime} | ${s.id} | ${cli} | ${s.agent_id} |`);
  }

  console.log(`\nCLI: ${getCliSkills().length} · agent-interactive: ${getCursorOnlySkills().length}`);
  console.log("\n例: npm run orgos -- skills run contract-expiry");
  console.log("     npm run orgos -- pipeline run daily");
  console.log("     npm run orgos -- route list");
}

export interface SkillRunOptions {
  days?: number;
  month?: string;
  output?: string;
  markdown?: boolean;
  id?: string;
  period?: string;
  dryRun?: boolean;
  to?: string;
  subject?: string;
  body?: string;
  channel?: string;
  slackChannel?: string;
  answers?: string;
  json?: boolean;
  topic?: string;
  agent?: string;
  all?: boolean;
  target?: string;
  enabled?: boolean;
  staleDays?: number;
  write?: boolean;
  mailId?: string;
  case?: string;
  contactRef?: string;
  iso?: string;
  operatorId?: string;
  plan?: string;
  req?: string;
  name?: string;
  hired_date?: string;
}

async function executeCoreSkillCommand(id: string, opts: SkillRunOptions): Promise<void> {
  const skill = SKILL_COMMANDS.find((s) => s.id === id);
  if (!skill) {
    throw new Error(`Unknown core skill command: ${id}`);
  }

  ensureSkillWriteAuth(id, opts);

  switch (id) {
    case "contract-expiry":
      runAlerts({
        days: opts.days ?? 90,
        output: opts.output,
        markdown: opts.markdown,
      });
      break;
    case "permit-expiry": {
      const result = runPermitExpiryCheck();
      const md = formatPermitCheckReport(result);
      if (opts.output) {
        const path = writeMarkdownReport(
          "agent-summaries/compliance",
          opts.output ?? `permit-${currentDate()}.md`,
          md
        );
        console.log(`✓ ${path}`);
      } else {
        console.log(md);
      }
      if (result.draftInsurance.length) process.exit(1);
      break;
    }
    case "monthly-close": {
      const month = opts.month ?? currentDate().slice(0, 7);
      runFinancesClose({
        month,
        output: opts.output ?? `${month}-close.md`,
      });
      break;
    }
    case "variance": {
      const report = computeVarianceReport("FY2026");
      const md = formatVarianceMarkdown(report);
      if (opts.output) {
        const path = writeMarkdownReport("plans/variance", opts.output ?? "fy2026-variance-auto.md", md);
        console.log(`✓ ${path}`);
      } else {
        console.log(md);
      }
      break;
    }
    case "noi-analysis": {
      runAnalyzeProperty({
        id: opts.id,
        period: opts.period,
        output: opts.output,
      });
      break;
    }
    case "journal-post": {
      if (!opts.month) {
        throw new Error("journal-post requires --month for depreciation source");
      }
      runLedgerPostSource({ source: "depreciation", month: opts.month });
      break;
    }
    case "trial-balance": {
      const month = opts.month ?? currentDate().slice(0, 7);
      runLedgerTrialBalance({ asOf: `${month}-28`, json: opts.json });
      runLedgerMonthlyReconcile({ month, json: opts.json });
      break;
    }
    case "journal-export-csv": {
      const month = opts.month;
      runLedgerExport({
        template: "journal-csv",
        from: month ? `${month}-01` : undefined,
        to: month ? `${month}-31` : undefined,
        output: opts.output,
        dryRun: opts.dryRun,
      });
      break;
    }
    case "trial-balance-export-csv": {
      const month = opts.month ?? currentDate().slice(0, 7);
      runLedgerExport({
        template: "trial-balance-csv",
        asOf: `${month}-28`,
        output: opts.output,
        dryRun: opts.dryRun,
      });
      break;
    }
    case "depreciation-run": {
      runTaxDepreciation({ json: opts.json });
      if (opts.month) {
        runLedgerPostSource({ source: "depreciation", month: opts.month });
      }
      break;
    }
    case "consumption-tax-calc": {
      const period = opts.month ?? currentDate().slice(0, 7);
      runTaxConsumptionCalc({ period, json: opts.json });
      break;
    }
    case "payroll-calc": {
      const month = opts.month ?? currentDate().slice(0, 7);
      console.log(`Run: npm run orgos -- operations payroll calc --month ${month}`);
      break;
    }
    case "annual-close": {
      const fy = opts.period ?? "FY2026";
      runFinancesClose({
        fiscalYear: fy,
        output: opts.output ?? `${fy.toLowerCase()}-annual-close.md`,
      });
      break;
    }
    case "p0":
      runOpsP0();
      break;
    case "daily":
      runOpsDaily();
      break;
    case "dashboard":
      runDashboard({ markdown: opts.markdown ?? true, output: opts.output });
      break;
    case "forecast":
      runForecast({ months: 12, format: opts.markdown ? "markdown" : "text", output: opts.output });
      break;
    case "change-plan": {
      const { runChangePlan } = await import("./change.js");
      let intentJson = opts.body;
      if (!intentJson && opts.id) {
        intentJson = JSON.stringify({
          grade: "A",
          summary: `apply intent ${opts.id}`,
          intent_id: opts.id,
        });
      }
      if (!intentJson) {
        throw new Error(
          "change-plan requires --body (intent YAML/JSON) or --id set_opened_date|set_max_guests|sync_derived"
        );
      }
      let raw: unknown;
      try {
        raw = JSON.parse(intentJson);
      } catch {
        const YAML = (await import("yaml")).default;
        raw = YAML.parse(intentJson);
      }
      runChangePlan({ intentJson: JSON.stringify(raw), json: opts.json, save: true });
      break;
    }
    case "change-apply": {
      const { runChangeApply } = await import("./change.js");
      if (!opts.id) {
        throw new Error("change-apply requires --id <proposalId>");
      }
      runChangeApply({
        proposal: opts.id,
        write: Boolean(opts.write),
        dryRun: !opts.write,
        json: opts.json,
      });
      break;
    }
    case "hr-headcount":
      runHrHeadcount({ json: opts.json });
      break;
    case "hr-onboard":
      runHrOnboard({
        name: opts.name,
        hired_date: opts.hired_date,
        write: Boolean(opts.write),
        json: opts.json,
      });
      break;
    case "pmo-portfolio":
      runPmoPortfolio({ json: opts.json });
      break;
    case "pmo-milestones":
      runPmoMilestones({ json: opts.json, days: opts.days });
      break;
    case "pmo-risks":
      runPmoRisks({ json: opts.json });
      break;
    case "pmo-show": {
      if (!opts.id) {
        throw new Error("pmo-show requires --id PRJ-…");
      }
      runPmoShow(opts.id, { json: opts.json });
      break;
    }
    case "analytics-kpi":
      runAnalyticsKpi({ json: opts.json });
      break;
    case "analytics-metrics":
      runAnalyticsMetrics({ json: opts.json });
      break;
    case "analytics-quality":
      runAnalyticsQuality({ json: opts.json });
      break;
    case "expense-claim":
      runExpenseClaimList({ json: opts.json });
      break;
    case "tenant-config-propose": {
      const { runTenantConfigPropose } = await import("./tenant-config.js");
      const { parseTenantConfigProposeIntent } = await import(
        "../lib/steward-chat/tenant-config-intent.js"
      );
      const { requireCliOperator } = await import(
        "../lib/console-auth/cli-operator.js"
      );
      requireCliOperator({
        permission: "chat:ask",
        command: "skills run tenant-config-propose",
      });
      let target = opts.target;
      let id = opts.id;
      let enabled = opts.enabled;
      if ((!target || !id || enabled === undefined) && opts.body) {
        const parsed = parseTenantConfigProposeIntent(opts.body);
        if (parsed) {
          target = target ?? parsed.target;
          id = id ?? parsed.targetId;
          enabled = enabled ?? parsed.enabled;
        }
      }
      if (!target || !id || enabled === undefined) {
        throw new Error(
          "tenant-config-propose requires --target, --id, --enabled (or a natural-language body)"
        );
      }
      runTenantConfigPropose({
        target,
        id,
        enabled,
        message: opts.subject,
      });
      break;
    }
    case "schedule": {
      const calPath = join(getExecutiveDir(), "calendar.yaml");
      if (!existsSync(calPath)) {
        console.log("calendar.yaml なし — example を tenant init でコピー");
        break;
      }
      const cal = readYamlFile(calPath, calendarFileSchema);
      console.log(`予定 ${cal.events?.length ?? 0} 件 · ${currentDate()}`);
      break;
    }
    case "schedule-coordination":
      runScheduleCoordinationSkill({ json: opts.json });
      break;
    case "one-on-one": {
      const oooPath = join(getExecutiveDir(), "one-on-ones.yaml");
      if (!existsSync(oooPath)) {
        console.log("one-on-ones.yaml なし");
        break;
      }
      const ooo = readYamlFile(oooPath, oneOnOnesFileSchema);
      console.log(`1-on-1 登録 ${ooo.one_on_ones?.length ?? 0} 件`);
      break;
    }
    case "tax-filing-prep":
      runTaxFilingPrepSkill(opts);
      break;
    case "contract-register":
      runContractRegisterSkill(opts);
      break;
    case "capex-planning":
      runCapexPlanningSkill(opts);
      break;
    case "iso-control-review": {
      const md = formatControlStatusReport();
      const path = writeMarkdownReport(
        "agent-summaries/compliance",
        opts.output ?? `controls-${currentDate()}.md`,
        md
      );
      console.log(`✓ ${path}`);
      if (computeControlGaps().length) process.exit(1);
      break;
    }
    case "internal-audit-scope": {
      const ctrls = controlsForAgent("internal_audit");
      const lines = [
        "# Internal Audit Scope — CTL",
        "",
        `**Date:** ${currentDate()}`,
        `**Controls:** ${ctrls.length}`,
        "",
      ];
      for (const c of ctrls) {
        lines.push(`- ${c.id} (${c.tenant_maturity}/${c.target_maturity}) — ${c.title}`);
      }
      lines.push("");
      const path = writeMarkdownReport(
        "agent-summaries/internal-audit",
        opts.output ?? `controls-${currentDate()}.md`,
        lines.join("\n")
      );
      console.log(`✓ ${path}`);
      break;
    }
    case "iso-internal-audit-run": {
      const { runIsoAuditRun } = await import("./iso-audit.js");
      runIsoAuditRun({ json: opts.json, iso: opts.iso, dryRun: opts.dryRun });
      break;
    }
    case "iso-internal-audit-report": {
      const { runIsoAuditReport } = await import("./iso-audit.js");
      runIsoAuditReport({ json: opts.json, runId: opts.id });
      break;
    }
    case "iso-audit-brief": {
      const { runIsoAuditBrief } = await import("./iso-audit-plan.js");
      runIsoAuditBrief({ json: opts.json, plan: opts.plan, req: opts.req ?? opts.id });
      break;
    }
    case "iso-audit-follow-up": {
      const { runIsoAuditFollowUp } = await import("./iso-audit-plan.js");
      runIsoAuditFollowUp({ json: opts.json, plan: opts.plan ?? opts.id });
      break;
    }
    case "company-events-chain-verify": {
      const md = formatChainVerifyReport();
      const path = writeMarkdownReport(
        "agent-summaries/records-audit",
        opts.output ?? `chain-verify-${currentDate()}.md`,
        md
      );
      console.log(`✓ ${path}`);
      const fail = md.includes("**Result:** FAIL");
      if (fail) process.exit(1);
      break;
    }
    case "company-events-weekly-attest": {
      const result = runWeeklyCompanyEventsAttestation();
      if (result.skipped) {
        console.log(`✓ Weekly attestation exists: ${result.attestation.attestation_id}`);
        break;
      }
      console.log(`✓ Weekly attestation signed: ${result.attestation.attestation_id}`);
      console.log(`  → ${result.path}`);
      break;
    }
    case "company-events-monthly-audit": {
      const result = await runMonthlyCompanyEventsAudit({
        output: opts.output,
        notify: true,
      });
      console.log(result.ok ? "✓ Monthly audit PASS" : "✗ Monthly audit FAIL");
      console.log(`  report: ${result.report_path}`);
      console.log(`  notified: ${result.notification_sent}`);
      if (!result.ok) process.exit(1);
      break;
    }
    case "correspondence-send":
      await runCorrespondenceSendSkill({ id: opts.id, dryRun: opts.dryRun });
      break;
    case "slack-notify":
      await runSlackNotifySkill({ id: opts.id, dryRun: opts.dryRun });
      break;
    case "correspondence-draft":
      runCorrespondenceDraft({
        channel: opts.channel,
        to: opts.to,
        subject: opts.subject,
        body: opts.body,
        slackChannel: opts.slackChannel,
      });
      break;
    case "correspondence-compose":
      await runCorrespondenceCompose({
        mailId: opts.mailId ?? opts.id ?? "",
        caseId: opts.case,
        to: opts.to,
        contactRef: opts.contactRef,
      });
      break;
    case "mail-intake-triage": {
      const { runMailIntakeTriage } = await import("./mail-intake.js");
      await runMailIntakeTriage({ notify: true });
      break;
    }
    case "tenant-integrations-setup": {
      const { runTenantSetupCommand } = await import("./tenant-setup.js");
      if (!opts.answers) {
        console.error("tenant-integrations-setup requires --answers <jsonPath>");
        process.exit(1);
      }
      await runTenantSetupCommand({
        answers: opts.answers,
        nonInteractive: true,
        skipValidate: true,
      });
      break;
    }
    case "platform-implement-guide": {
      const { runPlatformGuide } = await import("./platform-guide.js");
      runPlatformGuide({ topic: opts.topic, json: opts.json });
      break;
    }
    case "validate": {
      const { runValidate } = await import("./validate.js");
      runValidate({ warnings: true });
      break;
    }
    case "doctor": {
      const { runDoctor } = await import("./doctor.js");
      runDoctor({});
      break;
    }
    case "deps-check": {
      const { runDepsCheck } = await import("./deps.js");
      runDepsCheck({});
      break;
    }
    case "integrations-status": {
      const { runIntegrationsStatus } = await import("./integrations.js");
      runIntegrationsStatus({ json: opts.json });
      break;
    }
    case "integration-brief": {
      const { runIntegrationBrief } = await import("./module-message.js");
      runIntegrationBrief({ agent: opts.agent, json: opts.json });
      break;
    }
    case "agent-pulse": {
      const { runAgentPulseCommand } = await import("./agent.js");
      runAgentPulseCommand({
        agent: opts.agent,
        all: opts.all ?? !opts.agent,
      });
      break;
    }
    case "escalate-run": {
      if (!opts.body?.trim()) {
        console.error("escalate-run requires body (Work Order text)");
        process.exit(1);
      }
      const { runEscalation } = await import("../lib/escalate.js");
      const result = runEscalation({
        fromAgent: "executive_steward",
        input: { text: opts.body.trim() },
        dryRun: opts.dryRun,
      });
      if (result.workOrders.length === 0) {
        console.log("No work orders created (no matching agents or dry-run).");
        break;
      }
      for (const wo of result.workOrders) {
        console.log(`✓ Work Order ${wo.id} → ${wo.to_agent}`);
      }
      break;
    }
    case "orchestration-status": {
      const { runOrchestrateStatusSkill } = await import("./orchestrate.js");
      runOrchestrateStatusSkill({ id: opts.id, json: opts.json });
      break;
    }
    case "sales-pipeline": {
      const view = buildSalesPipelineView({
        actionHorizonDays: opts.days ?? 14,
        includeDemo: false,
      });
      const md = formatSalesPipelineMarkdown(view);
      if (opts.output) {
        const path = writeMarkdownReport(
          "agent-summaries/sales-lead",
          opts.output ?? `pipeline-${currentDate()}.md`,
          md,
        );
        console.log(`✓ ${path}`);
      } else {
        console.log(md);
      }
      break;
    }
    case "sales-forecast": {
      const month = opts.month ?? currentDate().slice(0, 7);
      const forecast = buildSalesForecastView({ month, includeDemo: false });
      const md = formatSalesForecastMarkdown(forecast);
      if (opts.output) {
        const path = writeMarkdownReport(
          "agent-summaries/sales-lead",
          opts.output ?? `forecast-${month}.md`,
          md,
        );
        console.log(`✓ ${path}`);
      } else {
        console.log(md);
      }
      break;
    }
    case "sales-inbound": {
      const view = buildSalesInboundView({
        actionHorizonDays: opts.days ?? 7,
        staleDays: opts.staleDays ?? 3,
        includeDemo: false,
      });
      const md = formatSalesInboundMarkdown(view);
      if (opts.output) {
        const path = writeMarkdownReport(
          "agent-summaries/sales-inbound",
          opts.output ?? `inbound-${currentDate()}.md`,
          md,
        );
        console.log(`✓ ${path}`);
      } else {
        console.log(md);
      }
      break;
    }
    case "sales-outbound": {
      const view = buildSalesOutboundView({
        actionHorizonDays: opts.days ?? 7,
        includeDemo: false,
      });
      const md = formatSalesOutboundMarkdown(view);
      if (opts.output) {
        const path = writeMarkdownReport(
          "agent-summaries/sales-outbound",
          opts.output ?? `outbound-${currentDate()}.md`,
          md,
        );
        console.log(`✓ ${path}`);
      } else {
        console.log(md);
      }
      break;
    }
    case "cs-health": {
      const view = buildCustomerSuccessView({
        horizonDays: opts.days ?? 90,
        includeDemo: false,
      });
      const md = formatCustomerSuccessMarkdown(view, { showScores: true });
      if (opts.output) {
        const path = writeMarkdownReport(
          "agent-summaries/customer-success",
          opts.output ?? `health-${currentDate()}.md`,
          md,
        );
        console.log(`✓ ${path}`);
      } else {
        console.log(md);
      }
      break;
    }
    case "cs-renewal": {
      const view = buildCustomerSuccessView({
        horizonDays: opts.days ?? 90,
        includeDemo: false,
      });
      const lines = [
        `# 更新リスク — ${view.company_name}`,
        "",
        `**基準日:** ${view.as_of}`,
        `**Horizon:** ${view.horizon_days} 日`,
        `**該当:** ${view.renewal_alerts.length} 件`,
        "",
      ];
      if (view.renewal_alerts.length === 0) {
        lines.push("該当なし。");
      } else {
        lines.push(
          "| 顧客ID | 会社 | 更新日 | 残日数 | ヘルス |",
          "|---|---|---|---:|---|",
        );
        for (const r of view.renewal_alerts) {
          lines.push(
            `| ${r.account_id} | ${r.company} | ${r.renewal_date} | ${r.days_remaining} | ${r.health} |`,
          );
        }
      }
      const md = lines.join("\n");
      if (opts.output) {
        const path = writeMarkdownReport(
          "agent-summaries/customer-success",
          opts.output ?? `renewal-${currentDate()}.md`,
          md,
        );
        console.log(`✓ ${path}`);
      } else {
        console.log(md);
      }
      break;
    }
    case "classification-check":
      runClassificationCheck({ json: opts.json });
      break;
    case "platform-registry-verify": {
      const { runPlatformRegistryVerify } = await import("./platform-registry-verify.js");
      runPlatformRegistryVerify({ json: opts.json });
      break;
    }
    case "cto-tech-radar":
      runCtoTechRadarSkill(opts);
      break;
    default:
      throw new Error(`Core skill handler not implemented: ${id}`);
  }
}

const CORE_SKILL_HANDLERS: Readonly<Record<string, SkillHandler>> = {
  ...Object.fromEntries(
    SKILL_COMMANDS.map((skill) => [
      skill.skill,
      (opts: SkillRunOptions) => executeCoreSkillCommand(skill.id, opts),
    ])
  ),
  treasury_cash_position: runTreasuryCashPositionSkill,
  treasury_liquidity_forecast: runTreasuryLiquidityForecastSkill,
  procurement_order_review: runProcurementOrderReviewSkill,
  procurement_vendor_eval: runProcurementVendorEvalSkill,
  governance_meeting_prep: runGovernanceMeetingPrepSkill,
  governance_register_review: runGovernanceRegisterReviewSkill,
  risk_register_review: runRiskRegisterReviewSkill,
  risk_insurance_renewal: runRiskInsuranceRenewalSkill,
  privacy_data_inventory: runPrivacyDataInventorySkill,
  privacy_impact_review: runPrivacyImpactReviewSkill,
};

export async function runSkill(id: string, opts: SkillRunOptions = {}): Promise<void> {
  const resolution = resolveRegisteredSkillInvocation(id, opts);
  if (resolution.status !== "ready") {
    throw new Error(`Skill ${id} is not executable (${resolution.status}): ${resolution.reason}`);
  }
  const skill = getSkillById(id);
  const invoke = async (): Promise<void> => {
    await resolution.handler(opts);
  };
  const guardAgent = resolveSkillFsGuardAgentById(id);
  if (guardAgent) {
    await runWithFsGuardAgentAsync(guardAgent, invoke);
    return;
  }
  await invoke();
}

export function resolveRegisteredSkillInvocation(
  id: string,
  opts: SkillRunOptions = {}
): SkillInvocationResolution {
  return resolveSkillInvocation(id, opts, {
    core: CORE_SKILL_HANDLERS,
    module: getModuleSkillHandlers(),
  });
}

/** Unified dispatch resolver — skill id · cli_command · legacy alias. */
export const resolveSkillDispatch = resolveRegisteredSkillInvocation;
