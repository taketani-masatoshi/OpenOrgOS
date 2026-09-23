import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpTakkenCheck,
  runJpTakkenFee,
  runJpTakkenLicense,
  runJpTakkenShow,
  runJpTakkenStaffing,
  runJpTakkenValidate,
} from "./commands.js";

export const MODULE_ID = "jp_takken";

const AS_OF_OPTION = ["--as-of <date>", "Evaluation date YYYY-MM-DD (default: today)"] as const;

function registerTakkenCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("takken")
    .description("JP real estate brokerage licence compliance (jp_takken)");

  cmd
    .command("show")
    .description("Licence, offices, transactions, and official sources")
    .option("--json", "JSON output")
    .action((opts) => runJpTakkenShow({ json: opts.json }));

  cmd.command("validate").description("Validate takken module data files").action(() => runJpTakkenValidate());

  cmd
    .command("license")
    .description("Licence renewal window (施行規則3条), change notifications (法9条), security deposit")
    .option(...AS_OF_OPTION)
    .option("--json", "JSON output")
    .action((opts) => runJpTakkenLicense({ asOf: opts.asOf, json: opts.json }));

  cmd
    .command("staffing")
    .description("Dedicated takkenshi ratio per office (法31条の3) and card expiry (法22条の2)")
    .option(...AS_OF_OPTION)
    .option("--json", "JSON output")
    .action((opts) => runJpTakkenStaffing({ asOf: opts.asOf, json: opts.json }));

  cmd
    .command("fee")
    .description("Maximum brokerage / agency fee under the MLIT fee notice (法46条)")
    .requiredOption("--kind <kind>", "sale | exchange | lease")
    .requiredOption("--price <yen>", "Price excl. tax (sale/exchange) or monthly rent excl. tax (lease)")
    .option("--role <role>", "brokerage | agency", "brokerage")
    .option("--low-cost-vacant", "Apply 低廉な空家等 special rule (sale/exchange ≤ 8,000,000 yen)")
    .option("--residential", "Residential lease (0.5 month per party without consent)")
    .option("--tax-status <status>", "taxable | exempt (default: settings.yaml)")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpTakkenFee({
        kind: opts.kind,
        price: opts.price,
        role: opts.role,
        lowCostVacant: opts.lowCostVacant,
        residential: opts.residential,
        taxStatus: opts.taxStatus,
        json: opts.json,
      })
    );

  cmd
    .command("check")
    .description("Per-transaction 35条 / 37条 / fee checks and office postings · records")
    .option(...AS_OF_OPTION)
    .option("--write", "Write report to the module docs root (docs/takken/)")
    .option("--json", "JSON output")
    .action((opts) => runJpTakkenCheck({ asOf: opts.asOf, json: opts.json, write: opts.write }));
}

export const jp_takkenCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerTakkenCommands(ctx.operationsCmd);
  },
};
