import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpTrademarkChecklist,
  runJpTrademarkDraft,
  runJpTrademarkShow,
  runJpTrademarkValidate,
} from "./commands.js";

export const MODULE_ID = "jp_trademark_application";

function registerTrademarkCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("trademark")
    .description("JP trademark application — forms · checklist · draft (jp_trademark_application)");

  cmd
    .command("show")
    .description("Applications, marks, and official form sources")
    .option("--json", "JSON output")
    .action((opts) => runJpTrademarkShow({ json: opts.json }));

  cmd.command("validate").description("Validate trademark module data files").action(() => runJpTrademarkValidate());

  cmd
    .command("checklist")
    .description("Pre-filing checklist for an application")
    .requiredOption("--application <id>", "Application id from trademark-registry.yaml")
    .option("--json", "JSON output")
    .action((opts) => runJpTrademarkChecklist({ application: opts.application, json: opts.json }));

  cmd
    .command("draft")
    .description("Generate 商標登録願 from JPO/INPIT-aligned templates")
    .requiredOption("--application <id>", "Application id from trademark-registry.yaml")
    .option("--write", "Write files to docs/trademark/{id}/")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpTrademarkDraft({
        application: opts.application,
        write: opts.write,
        json: opts.json,
      })
    );
}

export const jp_trademark_applicationCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerTrademarkCommands(ctx.operationsCmd);
  },
};
