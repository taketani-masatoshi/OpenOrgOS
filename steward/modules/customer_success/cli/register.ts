import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { currentDate, writeMarkdownReport } from "../../../../src/lib/utils.js";
import {
  runCustomerSuccessHealth,
  runCustomerSuccessNps,
  runCustomerSuccessOnboarding,
  runCustomerSuccessShow,
  runCustomerSuccessValidate,
} from "./commands.js";
import {
  buildModuleCustomerSuccessView,
} from "./lib.js";
import {
  formatCustomerSuccessMarkdown,
} from "../../../../src/lib/customer-success-view.js";

export const MODULE_ID = "customer_success";

function runOnboardingReviewSkill(opts: SkillRunOptions): void {
  const view = buildModuleCustomerSuccessView({ includeDemo: false });
  const lines = [
    `# オンボーディングレビュー — ${view.company_name}`,
    "",
    `**基準日:** ${view.as_of}`,
    `**遅延:** ${view.onboarding_overdue.length} 件`,
    "",
  ];
  if (view.onboarding_overdue.length === 0) {
    lines.push("遅延なし。");
  } else {
    for (const o of view.onboarding_overdue) {
      lines.push(
        `- ${o.company} (${o.account_id}): ${o.milestone_key} · ${o.days_overdue} 日超過`,
      );
    }
  }
  const md = lines.join("\n");
  if (opts.output) {
    writeMarkdownReport(
      "agent-summaries/customer-success",
      opts.output ?? `onboarding-${currentDate()}.md`,
      md,
    );
  } else {
    console.log(md);
  }
}

function runNpsAnalysisSkill(opts: SkillRunOptions): void {
  const view = buildModuleCustomerSuccessView({ includeDemo: false });
  const n = view.nps;
  const md = [
    `# NPS 分析 — ${view.company_name}`,
    "",
    `**基準日:** ${view.as_of}`,
    `- 回答数: ${n.responses}`,
    `- Promoters: ${n.promoters}`,
    `- Passives: ${n.passives}`,
    `- Detractors: ${n.detractors}`,
    `- NPS: ${n.nps ?? "—"}`,
    "",
  ].join("\n");
  if (opts.output) {
    writeMarkdownReport(
      "agent-summaries/customer-success",
      opts.output ?? `nps-${currentDate()}.md`,
      md,
    );
  } else {
    console.log(md);
  }
}

export const customer_successCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("customer-success")
      .description("Customer success — health score · onboarding · NPS · QBR");

    cmd
      .command("show")
      .description("Module status summary")
      .option("--json", "JSON output")
      .action((opts) => runCustomerSuccessShow({ json: opts.json }));

    cmd.command("validate").description("Validate module data files").action(() => {
      runCustomerSuccessValidate();
    });

    cmd
      .command("health")
      .description("Health scores and drift")
      .option("--json", "JSON output")
      .option("--drift-only", "Show drift accounts only")
      .action((opts) =>
        runCustomerSuccessHealth({ json: opts.json, driftOnly: opts.driftOnly }),
      );

    cmd
      .command("onboarding")
      .description("Overdue onboarding milestones")
      .option("--json", "JSON output")
      .action((opts) => runCustomerSuccessOnboarding({ json: opts.json }));

    cmd
      .command("nps")
      .description("NPS aggregate")
      .option("--json", "JSON output")
      .action((opts) => runCustomerSuccessNps({ json: opts.json }));
  },
  skillHandlers: {
    cs_onboarding_review: runOnboardingReviewSkill,
    cs_nps_analysis: runNpsAnalysisSkill,
  },
};
