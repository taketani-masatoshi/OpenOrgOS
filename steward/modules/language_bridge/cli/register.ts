import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import {
  runLanguageBridgeDraft,
  runLanguageBridgeHeader,
  runLanguageBridgeShow,
  runLanguageBridgeValidate,
} from "./commands.js";

export const MODULE_ID = "language_bridge";

function registerLanguageBridgeCommands(operationsCmd: Command): void {
  const bridgeCmd = operationsCmd
    .command("locale-bridge")
    .description("User vs system record language (language_bridge module)");

  bridgeCmd
    .command("show")
    .description("Show resolved user/system languages")
    .option("--json", "JSON output")
    .action((opts) => runLanguageBridgeShow({ json: opts.json }));

  bridgeCmd.command("validate").description("Validate language-bridge.yaml").action(runLanguageBridgeValidate);

  bridgeCmd
    .command("header")
    .description("Print YAML frontmatter for a document type")
    .requiredOption("--doc <type>", "board_minutes | shareholder_minutes | executive_summary")
    .action((opts) => runLanguageBridgeHeader({ doc: opts.doc }));

  bridgeCmd
    .command("draft")
    .description("Scaffold bilingual minutes markdown")
    .requiredOption("--type <type>", "Document type (e.g. board_minutes)")
    .requiredOption("--title <text>", "Meeting title")
    .option("--date <YYYY-MM-DD>", "Meeting date")
    .option("--slug <slug>", "Filename slug")
    .option("--write", "Write to docs/company/minutes/")
    .action((opts) =>
      runLanguageBridgeDraft({
        type: opts.type,
        title: opts.title,
        date: opts.date,
        slug: opts.slug,
        write: opts.write,
      })
    );
}

export const languageBridgeCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerLanguageBridgeCommands(ctx.operationsCmd);
  },
};
