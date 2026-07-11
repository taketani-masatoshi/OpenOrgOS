import {
  getCliSkills,
  getCursorOnlySkills,
  loadSkillRegistry,
  validateSkillRegistryFiles,
} from "../lib/skill-registry.js";
import { runAlerts } from "./alerts.js";
import { runOpsP0, runOpsDaily } from "./ops.js";
import { runPermitExpiryCheck, formatPermitCheckReport } from "../lib/permit-check.js";
import { computeVarianceReport, formatVarianceMarkdown } from "../lib/variance.js";
import { resolveModuleSkillHandler } from "../lib/module-cli.js";
import { loadMonthlyFinance } from "../lib/data.js";
import { runDashboard } from "./dashboard.js";
import { runForecast } from "./forecast.js";
import { currentDate, readYamlFile, writeMarkdownReport, getExecutiveDir } from "../lib/utils.js";
import {
  runCorrespondenceSendSkill,
  runSlackNotifySkill,
  runCorrespondenceDraft,
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
import { join } from "node:path";
import { existsSync } from "node:fs";
import { calendarFileSchema, oneOnOnesFileSchema } from "../../schemas/executive.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";
import {
  runCapexPlanningSkill,
  runContractRegisterSkill,
  runTaxFilingPrepSkill,
} from "../lib/core-skill-runners.js";

const SKILLS_ALWAYS_WRITE = new Set([
  "dashboard",
  "iso-control-review",
  "internal-audit-scope",
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
    id: "records-check",
    skill: "operations_records",
    agent: "Operations",
    description: "宿泊 · 清掃 · クレーム記録の蓄積確認",
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
    id: "one-on-one",
    skill: "one_on_one_prep",
    agent: "Secretary",
    description: "1-on-1 レジストリサマリ",
  },
  {
    id: "tax-filing-prep",
    skill: "tax_filing_prep",
    agent: "Finance",
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
] as const;

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
    console.log(`| ${s.runtime} | ${s.id} | ${cli} | ${s.agent} |`);
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
  dryRun?: boolean;
  to?: string;
  subject?: string;
  body?: string;
  channel?: string;
  slackChannel?: string;
  answers?: string;
}

export async function runSkill(id: string, opts: SkillRunOptions = {}): Promise<void> {
  const moduleHandler = resolveModuleSkillHandler(id);
  if (moduleHandler) {
    moduleHandler(opts);
    return;
  }

  const skill = SKILL_COMMANDS.find((s) => s.id === id);
  if (!skill) {
    console.error(`Unknown skill command: ${id}`);
    console.error("Run: steward skills list");
    process.exit(1);
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
      const entry = loadMonthlyFinance(month);
      if (!entry) {
        console.error(`月次 YAML なし: data/finance/monthly/${month}.yaml`);
        process.exit(1);
      }
      const rev = entry.revenue.reduce((s, r) => s + r.amount, 0);
      const exp = entry.expenses.reduce((s, e) => s + e.amount, 0);
      console.log(
        `月次締め ${month}: 売上 ${rev.toLocaleString()} · 費用 ${exp.toLocaleString()} · 純 ${(rev - exp).toLocaleString()}`
      );
      console.log(`\n次: npm run orgos -- deps check --file data/finance/monthly/${month}.yaml`);
      console.log("     npm run validate");
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
    default:
      process.exit(1);
  }
}
