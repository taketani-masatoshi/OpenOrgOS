import type { Command } from "commander";
import { laborAsOfDate } from "../../../../../../schemas/jp-labor-contract.js";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpLaborContractCheck,
  runJpLaborContractConversionCheck,
  runJpLaborContractDraft,
  runJpLaborContractShow,
  runJpLaborContractValidate,
} from "./commands.js";

export const MODULE_ID = "jp_labor_contract";

function parseAsOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const parsed = laborAsOfDate.safeParse(value);
  if (parsed.success) return parsed.data;
  console.error(`--as-of must be a calendar date YYYY-MM-DD (got ${value})`);
  process.exit(1);
}

function registerLaborContractCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("labor-contract")
    .description("JP employment contracts and working-condition notices (jp_labor_contract)");

  cmd
    .command("show")
    .description("Contracts, minimum wage table, and official sources")
    .option("--json", "JSON output")
    .action((opts) => runJpLaborContractShow({ json: opts.json }));

  cmd
    .command("validate")
    .description("Validate labor contract module data files")
    .action(() => runJpLaborContractValidate());

  cmd
    .command("check")
    .description(
      "Check required disclosures, fixed-term length, probation, and minimum wage for a contract"
    )
    .requiredOption("--contract <id>", "Contract id from labor-contracts.yaml")
    .option("--as-of <date>", "Evaluation date (YYYY-MM-DD, default today)")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpLaborContractCheck({
        contract: opts.contract,
        asOf: parseAsOf(opts.asOf),
        json: opts.json,
      })
    );

  cmd
    .command("conversion-check")
    .description(
      "Cumulative fixed-term period, indefinite conversion right, and non-renewal notice deadline"
    )
    .option("--as-of <date>", "Evaluation date (YYYY-MM-DD, default today)")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpLaborContractConversionCheck({ asOf: parseAsOf(opts.asOf), json: opts.json })
    );

  cmd
    .command("draft")
    .description("Generate 労働条件通知書 MD from the seed template")
    .requiredOption("--contract <id>", "Contract id from labor-contracts.yaml")
    .option("--write", "Write to the module docs root (docs/company/hr/labor-contracts/{id}/)")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpLaborContractDraft({ contract: opts.contract, write: opts.write, json: opts.json })
    );
}

export const jp_labor_contractCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerLaborContractCommands(ctx.operationsCmd);
  },
};
