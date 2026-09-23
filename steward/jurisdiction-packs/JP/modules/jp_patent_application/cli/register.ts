import type { Command } from "commander";
import { patentAsOfDate } from "../../../../../../schemas/jp-patent.js";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpPatentChecklist,
  runJpPatentDeadlines,
  runJpPatentDraft,
  runJpPatentShow,
  runJpPatentValidate,
} from "./commands.js";

export const MODULE_ID = "jp_patent_application";

function parseAsOf(value: string | undefined): string | undefined {
  return value === undefined ? undefined : patentAsOfDate.parse(value);
}

function registerPatentCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("patent")
    .description("JP patent application drafting and deadline tracking (jp_patent_application)");

  cmd
    .command("show")
    .description("Applications, specification inputs, and official sources")
    .option("--json", "JSON output")
    .action((opts) => runJpPatentShow({ json: opts.json }));

  cmd.command("validate").description("Validate patent module data files").action(() => runJpPatentValidate());

  cmd
    .command("deadlines")
    .description("Priority · novelty exception · exam request · publication · annuity deadlines")
    .option("--as-of <date>", "Evaluation date YYYY-MM-DD (default: today)")
    .option("--json", "JSON output")
    .action((opts) => runJpPatentDeadlines({ asOf: parseAsOf(opts.asOf), json: opts.json }));

  cmd
    .command("checklist")
    .description("Pre-filing formal checklist (Patent Act art. 36 · Form 26 · Rules art. 24-3)")
    .requiredOption("--application <id>", "Application id from patent-registry.yaml")
    .option("--as-of <date>", "Evaluation date YYYY-MM-DD (default: today)")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpPatentChecklist({ application: opts.application, asOf: parseAsOf(opts.asOf), json: opts.json })
    );

  cmd
    .command("draft")
    .description("Draft 特許願 · 明細書 · 特許請求の範囲 · 要約書 from templates")
    .requiredOption("--application <id>", "Application id from patent-registry.yaml")
    .option("--as-of <date>", "Generation date YYYY-MM-DD (default: today)")
    .option("--write", "Write files to docs/ip/patent/<id>/")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpPatentDraft({
        application: opts.application,
        asOf: parseAsOf(opts.asOf),
        write: opts.write,
        json: opts.json,
      })
    );
}

export const jp_patent_applicationCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerPatentCommands(ctx.operationsCmd);
  },
};
