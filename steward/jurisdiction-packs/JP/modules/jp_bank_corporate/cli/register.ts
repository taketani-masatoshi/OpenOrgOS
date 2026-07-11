import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../../../src/commands/skills.js";
import {
  runJpBankArApList,
  runJpBankArApSync,
  runJpBankArApValidate,
  runJpBankCalendarImport,
  runJpBankCalendarValidate,
  runJpBankCashflowExport,
  runJpBankCashflowGenerate,
  runJpBankPositionShow,
  runJpBankPositionSkill,
  runJpBankStatementImport,
  runJpBankTreasurySkill,
  MODULE_ID,
} from "./lib.js";

function registerJpBankCommands(program: Command): void {
  const jp = program.command("jp").description("JP jurisdiction commands");

  const bank = jp.command("bank").description("JP bank corporate — cashflow · treasury (jp_bank_corporate)");

  const cashflow = bank.command("cashflow").description("資金繰り表");

  cashflow
    .command("generate")
    .description("Generate cashflow schedule")
    .option("--granularity <g>", "daily | weekly | monthly", "weekly")
    .option("--horizon <h>", "Horizon e.g. 13w, 90d, 3m", "13w")
    .option("--format <f>", "md | csv | json", "md")
    .option("--write", "Write to docs/finance/treasury/cashflow-schedule/")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpBankCashflowGenerate({
        granularity: opts.granularity,
        horizon: opts.horizon,
        format: opts.format,
        write: opts.write,
        json: opts.json,
      })
    );

  cashflow
    .command("export")
    .description("Export cashflow to template")
    .option("--template <id>", "Export template id", "cash-book-csv")
    .option("--write", "Write CSV to docs/exports/")
    .option("--json", "JSON summary")
    .action((opts) =>
      runJpBankCashflowExport({
        template: opts.template,
        write: opts.write,
        json: opts.json,
      })
    );

  const position = bank.command("position").description("Cash position");
  position
    .command("show")
    .description("Show opening cash balance by account")
    .option("--as-of <date>", "As-of date YYYY-MM-DD")
    .option("--json", "JSON output")
    .action((opts) => runJpBankPositionShow({ asOf: opts.asOf, json: opts.json }));

  const calendar = bank.command("calendar").description("Payment calendar");

  calendar.command("validate").description("Validate payment-calendar.yaml").action(() => runJpBankCalendarValidate());

  calendar
    .command("import")
    .description("Import calendar entries from payroll|tax|yojitsu|contracts")
    .requiredOption("--from <source>", "payroll | tax | yojitsu | contracts")
    .option("--fy <fiscal-year>", "Fiscal year, e.g. FY2026")
    .option("--month <yyyy-mm>", "Target month, e.g. 2026-07")
    .option("--write", "Append to payment-calendar.yaml")
    .option("--json", "JSON output")
    .action((opts) => {
      const allowed = ["payroll", "tax", "yojitsu", "contracts"] as const;
      if (!allowed.includes(opts.from)) {
        console.error(`--from must be one of: ${allowed.join(", ")}`);
        process.exit(1);
      }
      runJpBankCalendarImport({
        from: opts.from,
        fy: opts.fy,
        month: opts.month,
        write: opts.write,
        json: opts.json,
      });
    });

  const arAp = bank.command("ar-ap").description("AR/AP ledger");

  arAp
    .command("list")
    .description("List AR/AP entries")
    .option("--kind <kind>", "ar | ap")
    .option("--json", "JSON output")
    .action((opts) => runJpBankArApList({ kind: opts.kind, json: opts.json }));

  arAp.command("validate").description("Validate ar-ap-ledger.yaml").action(() => runJpBankArApValidate());

  arAp
    .command("sync")
    .description("Sync AR/AP from external source")
    .option("--from <source>", "invoices")
    .option("--fy <fiscal-year>", "Fiscal year, e.g. FY2026")
    .option("--month <yyyy-mm>", "Target invoice month, e.g. 2026-07")
    .option("--write", "Write to ar-ap-ledger.yaml")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpBankArApSync({
        from: opts.from,
        fy: opts.fy,
        month: opts.month,
        write: opts.write,
        json: opts.json,
      })
    );

  const statement = bank.command("statement").description("Bank statement import");

  statement
    .command("import")
    .description("Import bank statement CSV into bank-statements.yaml")
    .requiredOption("--file <path>", "CSV file path")
    .option("--write", "Append to bank-statements.yaml")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpBankStatementImport({
        file: opts.file,
        write: opts.write,
        json: opts.json,
      })
    );
}

function runCashflowScheduleSkill(opts: SkillRunOptions): void {
  const write = "write" in opts && opts.write === true;
  runJpBankTreasurySkill({ write, output: opts.output });
}

function runTreasuryPositionSkill(opts: SkillRunOptions): void {
  runJpBankPositionSkill({ json: false });
  if (opts.output) {
    runJpBankCashflowGenerate({ granularity: "weekly", horizon: "4w", format: "md" });
  }
}

export const jp_bank_corporateCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerJpBankCommands(ctx.program);
  },
  skillHandlers: {
    "jp-cashflow-schedule": runCashflowScheduleSkill,
    "jp-treasury-position": runTreasuryPositionSkill,
  },
};

export { MODULE_ID };
