import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpSubsidyDraft,
  runJpSubsidyEligibility,
  runJpSubsidyLaborCost,
  runJpSubsidyShow,
  runJpSubsidyValidate,
} from "./commands.js";

export const MODULE_ID = "jp_subsidy_application";

function registerSubsidyCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("subsidy")
    .description("JP subsidy application — eligibility · labor cost · draft (jp_subsidy_application)");

  cmd
    .command("show")
    .description("Tracked programs and applications")
    .option("--json", "JSON output")
    .action((opts) => runJpSubsidyShow({ json: opts.json }));

  cmd.command("validate").description("Validate module data files").action(() => runJpSubsidyValidate());

  cmd
    .command("eligibility")
    .description("Check program requirements against company + HR metadata")
    .requiredOption("--program <id>", "Program id from programs.yaml")
    .option("--json", "JSON output")
    .action((opts) => runJpSubsidyEligibility({ program: opts.program, json: opts.json }));

  cmd
    .command("labor-cost")
    .description("Build personnel cost table from HR IDs + personnel-cost-basis.yaml")
    .option("--program <id>", "Program id (label only)")
    .option("--json", "JSON output")
    .action((opts) => runJpSubsidyLaborCost({ program: opts.program, json: opts.json }));

  cmd
    .command("draft")
    .description("Scaffold application fields from field-map + company/HR SoT")
    .requiredOption("--program <id>", "Program id from programs.yaml")
    .option("--json", "JSON output")
    .action((opts) => runJpSubsidyDraft({ program: opts.program, json: opts.json }));
}

export const jp_subsidy_applicationCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerSubsidyCommands(ctx.operationsCmd);
  },
};
