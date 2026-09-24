import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runSubcontractCheck,
  runSubcontractLateInterest,
  runSubcontractScope,
  runSubcontractShow,
  runSubcontractValidate,
} from "./commands.js";

export const MODULE_ID = "jp_subcontractor_act";

function registerSubcontractCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("subcontract")
    .description("JP small-contractor transaction compliance (jp_subcontractor_act)");

  cmd
    .command("show")
    .description("Principal settings, party facts, transactions, and official sources")
    .option("--json", "JSON output")
    .action((opts) => runSubcontractShow({ json: opts.json }));

  cmd
    .command("validate")
    .description("Validate subcontract module data files")
    .action(() => runSubcontractValidate());

  cmd
    .command("scope")
    .description("Coverage by transaction category × capital / employee thresholds")
    .option("--transaction <id>", "Transaction id from transactions.yaml")
    .option("--json", "JSON output")
    .action((opts) => runSubcontractScope({ transaction: opts.transaction, json: opts.json }));

  cmd
    .command("check")
    .description("Obligation and prohibited-act checks for covered transactions")
    .option("--as-of <date>", "Evaluation date YYYY-MM-DD (default: today)")
    .option("--write", "Write report to docs/procurement/subcontract/")
    .option("--json", "JSON output")
    .action((opts) => runSubcontractCheck({ asOf: opts.asOf, write: opts.write, json: opts.json }));

  cmd
    .command("late-interest")
    .description("Late-payment interest (14.6%/year) for a transaction")
    .requiredOption("--transaction <id>", "Transaction id from transactions.yaml")
    .option("--as-of <date>", "Provisional end date for unpaid amounts (default: today)")
    .option("--json", "JSON output")
    .action((opts) =>
      runSubcontractLateInterest({
        transaction: opts.transaction,
        asOf: opts.asOf,
        json: opts.json,
      })
    );
}

export const jp_subcontractor_actCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerSubcontractCommands(ctx.operationsCmd);
  },
};
