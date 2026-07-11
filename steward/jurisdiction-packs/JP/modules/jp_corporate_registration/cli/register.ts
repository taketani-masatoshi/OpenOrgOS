import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpCorporateChecklist,
  runJpCorporateDraft,
  runJpCorporateExportPdf,
  runJpCorporatePrepare,
  runJpCorporateProcedures,
  runJpCorporateShow,
  runJpCorporateValidate,
} from "./commands.js";

export const MODULE_ID = "jp_corporate_registration";

function registerCorporateCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("corporate")
    .description("JP corporate registration — 法務局登記手続 · 書類ドラフト (jp_corporate_registration)");

  cmd
    .command("procedures")
    .description("List Legal Affairs Bureau registration procedures")
    .option("--category <id>", "Filter by category or procedure id")
    .option("--json", "JSON output")
    .action((opts) => runJpCorporateProcedures({ json: opts.json, category: opts.category }));

  cmd
    .command("show")
    .description("Cases and module summary")
    .option("--json", "JSON output")
    .action((opts) => runJpCorporateShow({ json: opts.json }));

  cmd.command("validate").description("Validate module data files").action(() => runJpCorporateValidate());

  cmd
    .command("checklist")
    .description("Pre-filing checklist for a registration case")
    .requiredOption("--case <id>", "Case id from case-registry.yaml")
    .option("--json", "JSON output")
    .action((opts) => runJpCorporateChecklist({ case: opts.case, json: opts.json }));

  cmd
    .command("prepare")
    .description("Generate full filing pack (簡略雛形) — index + all forms")
    .option("--case <id>", "Case id from case-registry.yaml")
    .option("--procedure <id>", "Ad-hoc simplified pack for procedure id (no case registry)")
    .option("--all", "All cases in case-registry.yaml")
    .option("--sample-all", "Sample pack for every procedure (docs/.../SIMPL-*)")
    .option("--write", "Write files to docs/corporate-registration/ or --event-id artifact dir")
    .option("--event-id <id>", "Write filing pack to company event artifact dir (EVT-*)")
    .option("--json", "JSON output")
    .action((opts) => {
      if ([opts.case, opts.procedure, opts.all, opts.sampleAll].filter(Boolean).length !== 1) {
        console.error("Specify exactly one of --case, --procedure, --all, or --sample-all");
        process.exit(1);
      }
      runJpCorporatePrepare({
        case: opts.case,
        procedure: opts.procedure,
        all: opts.all,
        sampleAll: opts.sampleAll,
        write: opts.write,
        json: opts.json,
        eventId: opts.eventId,
      });
    });

  cmd
    .command("draft")
    .description("Generate registration document drafts")
    .requiredOption("--case <id>", "Case id from case-registry.yaml")
    .option("--form <id>", "Single form id (e.g. form-teikan-kk) — default: all forms for procedure")
    .option("--write", "Write files to docs/corporate-registration/{case-id}/")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpCorporateDraft({
        case: opts.case,
        form: opts.form,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("export-pdf")
    .description("Export registration filing pack as PDF (TeX → xelatex)")
    .requiredOption("--case <id>", "Case id from case-registry.yaml")
    .option("--write", "Compile TeX and write PDF to docs/io/outbox/submissions/")
    .option("--force", "Export even if checklist items are missing")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpCorporateExportPdf({
        case: opts.case,
        write: opts.write,
        force: opts.force,
        json: opts.json,
      })
    );
}

export const jp_corporate_registrationCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerCorporateCommands(ctx.operationsCmd);
  },
};
