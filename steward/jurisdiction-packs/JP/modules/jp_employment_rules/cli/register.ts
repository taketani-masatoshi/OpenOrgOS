import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpAgreementCheck,
  runJpOvertimeCheck,
  runJpWorkRulesCheck,
  runJpWorkRulesDraft,
  runJpWorkRulesShow,
  runJpWorkRulesValidate,
} from "./commands.js";

export const MODULE_ID = "jp_employment_rules";

function registerWorkRulesCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("work-rules")
    .description("JP work rules and Article 36 agreement (jp_employment_rules)");

  cmd
    .command("show")
    .description("Workplaces, work rules, agreements, and official sources")
    .option("--json", "JSON output")
    .action((opts) => runJpWorkRulesShow({ json: opts.json }));

  cmd.command("validate").description("Validate work rules module data files").action(() => runJpWorkRulesValidate());

  cmd
    .command("check")
    .description("Work rules obligations per workplace (LSA Art. 89 · 90 · 106)")
    .option("--json", "JSON output")
    .action((opts) => runJpWorkRulesCheck({ json: opts.json }));

  cmd
    .command("agreement-check")
    .description("Article 36 agreement content limits, filing, and expiry")
    .option("--as-of <date>", "As-of date YYYY-MM-DD (default: today)")
    .option("--json", "JSON output")
    .action((opts) => runJpAgreementCheck({ asOf: opts.asOf, json: opts.json }));

  cmd
    .command("overtime-check")
    .description("Per-employee overtime vs statutory caps and agreement limits up to a month")
    .requiredOption("--month <YYYY-MM>", "Target month")
    .option("--json", "JSON output")
    .action((opts) => runJpOvertimeCheck({ month: opts.month, json: opts.json }));

  cmd
    .command("draft")
    .description("Draft work rules skeleton or Article 36 agreement form items (MD)")
    .option("--kind <kind>", "work-rules | agreement", "work-rules")
    .option("--workplace <id>", "Workplace id (work-rules)")
    .option("--agreement <id>", "Agreement id (agreement)")
    .option("--write", "Write to docs/company/hr/work-rules/")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpWorkRulesDraft({
        kind: opts.kind,
        workplace: opts.workplace,
        agreement: opts.agreement,
        write: opts.write,
        json: opts.json,
      })
    );
}

export const jp_employment_rulesCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerWorkRulesCommands(ctx.operationsCmd);
  },
};
