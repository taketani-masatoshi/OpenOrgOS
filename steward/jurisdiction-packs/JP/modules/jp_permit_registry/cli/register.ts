import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpPermitRegistryGap,
  runJpPermitRegistryList,
  runJpPermitRegistryObligations,
  runJpPermitRegistryShow,
  runJpPermitRegistryTypes,
  runJpPermitRegistryValidate,
} from "./lib.js";
import {
  runPermitApplicationChecklist,
  runPermitApplicationDraft,
  runPermitApplicationExportPdf,
  runPermitApplicationPrepare,
  runPermitApplicationShow,
} from "./application-lib.js";

export const MODULE_ID = "jp_permit_registry";

function registerPermitCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("permit")
    .description("JP permit registry — types · obligations · gap (jp_permit_registry)");

  cmd
    .command("show")
    .description("Catalog summary and tenant permit counts")
    .option("--json", "JSON output")
    .action((opts) => runJpPermitRegistryShow({ json: opts.json }));

  cmd.command("validate").description("Validate permit registry data files").action(() => runJpPermitRegistryValidate());

  cmd
    .command("types")
    .description("List JP permit types from catalog")
    .option("--category <id>", "Filter by category (e.g. accommodation)")
    .option("--json", "JSON output")
    .action((opts) => runJpPermitRegistryTypes({ category: opts.category, json: opts.json }));

  cmd
    .command("list")
    .description("List tenant permit instances")
    .option("--property <id>", "Filter by PROP-xxx")
    .option("--status <status>", "Filter by status")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpPermitRegistryList({
        property: opts.property,
        status: opts.status,
        json: opts.json,
      })
    );

  cmd
    .command("obligations")
    .description("Obligations for a permit type or tenant permit")
    .option("--type <id>", "Permit type id (e.g. pt-ryokan-hotel)")
    .option("--permit <id>", "Tenant permit instance id")
    .option("--json", "JSON output")
    .action((opts) => {
      if (!opts.type && !opts.permit) {
        console.error("Specify --type or --permit");
        process.exit(1);
      }
      runJpPermitRegistryObligations({
        type: opts.type,
        permit: opts.permit,
        json: opts.json,
      });
    });

  cmd
    .command("gap")
    .description("Expiry · missing prerequisites · overdue obligations")
    .option("--json", "JSON output")
    .action((opts) => runJpPermitRegistryGap({ json: opts.json }));

  const app = cmd.command("application").description("申請書 — prepare · checklist · draft · export-pdf");

  app
    .command("prepare")
    .description("社内 DB からフィールド自動入力 → drafts/*.yaml")
    .requiredOption("--application <id>", "Application id from application-registry.yaml")
    .option("--structure-use <text>", "建物用途（手入力）")
    .option("--business-type <text>", "飲食店業態")
    .option("--license-type <text>", "酒類免許種別")
    .option("--write", "Save draft YAML")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitApplicationPrepare({
        application: opts.application,
        structureUse: opts.structureUse,
        businessType: opts.businessType,
        licenseType: opts.licenseType,
        write: opts.write,
        json: opts.json,
      })
    );

  app
    .command("show")
    .description("Show application draft YAML fields")
    .requiredOption("--application <id>", "Application id")
    .option("--json", "JSON output")
    .action((opts) => runPermitApplicationShow({ application: opts.application, json: opts.json }));

  app
    .command("checklist")
    .description("Required field check before PDF export")
    .requiredOption("--application <id>", "Application id")
    .option("--write", "Update draft checklist status")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitApplicationChecklist({
        application: opts.application,
        write: opts.write,
        json: opts.json,
      })
    );

  app
    .command("draft")
    .description("Generate review MD from draft + template")
    .requiredOption("--application <id>", "Application id")
    .option("--write", "Write docs/permit-applications/{id}/application.md")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitApplicationDraft({
        application: opts.application,
        write: opts.write,
        json: opts.json,
      })
    );

  app
    .command("export-pdf")
    .description("Compile TeX → PDF for submission (requires xelatex)")
    .requiredOption("--application <id>", "Application id")
    .option("--write", "Write PDF to docs/io/outbox/submissions/")
    .option("--force", "Export even if checklist incomplete")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitApplicationExportPdf({
        application: opts.application,
        write: opts.write,
        force: opts.force,
        json: opts.json,
      })
    );
}

export const jp_permit_registryCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerPermitCommands(ctx.operationsCmd);
  },
};
