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
  runCapexPlanningSkill,
  runContractRegisterSkill,
  runTaxFilingPrepSkill,
} from "../lib/core-skill-runners.js";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { calendarFileSchema, oneOnOnesFileSchema } from "../../schemas/executive.js";

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

  console.log(`\nCLI: ${getCliSkills().length} · cursor-only: ${getCursorOnlySkills().length}`);
  console.log("\n例: npm run steward -- skills run contract-expiry");
  console.log("     npm run steward -- pipeline run daily");
  console.log("     npm run steward -- route list");
}

export interface SkillRunOptions {
  days?: number;
  month?: string;
  output?: string;
  markdown?: boolean;
}

export function runSkill(id: string, opts: SkillRunOptions = {}): void {
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
      console.log(`\n次: npm run steward -- deps check --file data/finance/monthly/${month}.yaml`);
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
    default:
      process.exit(1);
  }
}
