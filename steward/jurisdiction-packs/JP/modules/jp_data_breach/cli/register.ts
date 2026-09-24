import type { Command } from "commander";
import {
  breachAsOfDate,
  breachReportKind,
  type BreachReportKind,
} from "../../../../../../schemas/jp-data-breach.js";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpDataBreachAssess,
  runJpDataBreachDeadlines,
  runJpDataBreachDraft,
  runJpDataBreachShow,
  runJpDataBreachValidate,
} from "./commands.js";

export const MODULE_ID = "jp_data_breach";

function parseAsOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const parsed = breachAsOfDate.safeParse(value);
  if (parsed.success) return parsed.data;
  console.error(`--as-of must be a calendar date YYYY-MM-DD (got ${value})`);
  process.exit(1);
}

function parseKind(value: string): BreachReportKind {
  const parsed = breachReportKind.safeParse(value);
  if (parsed.success) return parsed.data;
  console.error(`--kind must be preliminary or final (got ${value})`);
  process.exit(1);
}

function registerDataBreachCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("data-breach")
    .description("JP personal data breach reporting to PPC (jp_data_breach)");

  cmd
    .command("show")
    .description("Incidents, assessment summary, and official sources")
    .option("--json", "JSON output")
    .action((opts) => runJpDataBreachShow({ json: opts.json }));

  cmd
    .command("validate")
    .description("Validate breach module data files")
    .action(() => runJpDataBreachValidate());

  cmd
    .command("assess")
    .description(
      "Reportable-situation check under APPI Enforcement Rules art. 7 (①–④ · exclusion · needs_review)"
    )
    .requiredOption("--incident <id>", "Incident id from incidents.yaml")
    .option("--json", "JSON output")
    .action((opts) => runJpDataBreachAssess({ incident: opts.incident, json: opts.json }));

  cmd
    .command("deadlines")
    .description("Preliminary / final report and individual notice status per incident")
    .option("--as-of <date>", "Evaluation date YYYY-MM-DD (default: today)")
    .option("--json", "JSON output")
    .action((opts) => runJpDataBreachDeadlines({ asOf: parseAsOf(opts.asOf), json: opts.json }));

  cmd
    .command("draft")
    .description("Draft report items (art. 8(1) nos. 1–9) from templates")
    .requiredOption("--incident <id>", "Incident id from incidents.yaml")
    .option("--kind <kind>", "preliminary | final", "preliminary")
    .option("--as-of <date>", "Evaluation date YYYY-MM-DD (default: today)")
    .option("--write", "Write to docs/compliance/privacy/breach/<incident-id>/")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpDataBreachDraft({
        incident: opts.incident,
        kind: parseKind(opts.kind),
        asOf: parseAsOf(opts.asOf),
        write: opts.write,
        json: opts.json,
      })
    );
}

export const jp_data_breachCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerDataBreachCommands(ctx.operationsCmd);
  },
};
