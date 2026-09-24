import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runForeignWorkersCheck,
  runForeignWorkersExpiry,
  runForeignWorkersNotifications,
  runForeignWorkersShow,
  runForeignWorkersValidate,
} from "./lib.js";
import { MODULE_ID } from "./statutory.js";

export { MODULE_ID };

interface ReportOptions {
  asOf?: string;
  json?: boolean;
}

function registerReportCommand(
  parent: Command,
  name: string,
  description: string,
  run: (opts: ReportOptions) => void
): void {
  parent
    .command(name)
    .description(description)
    .option("--as-of <YYYY-MM-DD>", "Evaluation date (default: today)")
    .option("--json", "JSON output")
    .action((opts: ReportOptions) => run({ asOf: opts.asOf, json: opts.json }));
}

function registerForeignWorkerCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("foreign-workers")
    .description("JP foreign worker residence status and employment notices (jp_visa_employment)");

  cmd
    .command("show")
    .description("Foreign workers summary, status catalog, and official sources")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) => runForeignWorkersShow({ json: opts.json }));

  cmd.command("validate").description("Validate foreign worker module data files").action(() => runForeignWorkersValidate());

  registerReportCommand(
    cmd,
    "check",
    "Work eligibility vs status/job category, permission hour limits, residence card verification",
    runForeignWorkersCheck
  );
  registerReportCommand(cmd, "expiry", "Period of stay expiry stages (renewal window · urgent · expired)", runForeignWorkersExpiry);
  registerReportCommand(
    cmd,
    "notifications",
    "Hello Work foreign employment notices (hire/separation) due/overdue",
    runForeignWorkersNotifications
  );
}

export const jp_visa_employmentCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerForeignWorkerCommands(ctx.operationsCmd);
  },
};
