#!/usr/bin/env node
import { Command } from "commander";
import { runValidate } from "./commands/validate.js";
import {
  runContractsList,
  runContractsShow,
  CONTRACT_TYPES,
} from "./commands/contracts.js";
import {
  runPropertiesList,
  runPropertiesShow,
  PROPERTY_TYPES,
} from "./commands/properties.js";
import {
  runFinancesSummary,
  runFinancesAdd,
  runFinancesList,
  runFinancesShow,
} from "./commands/finances.js";
import { runForecast } from "./commands/forecast.js";
import { runAnalyzeProperty } from "./commands/analyze.js";
import { runScenarioCommand } from "./commands/scenario.js";
import { runAlerts } from "./commands/alerts.js";
import { runReportMonthly, runReportKessan, runReportJigyo, runReportAnnual } from "./commands/report.js";

const program = new Command();

program
  .name("steward")
  .description("Steward OS - Property Business Edition CLI")
  .version("0.2.0");

program
  .command("validate")
  .description("Validate all data files")
  .action(runValidate);

const contracts = program.command("contracts").description("Contract ledger");

contracts
  .command("list")
  .description("List all contracts")
  .option("--type <type>", `Filter by type (${CONTRACT_TYPES.join(", ")})`)
  .option("--property <id>", "Filter by property ID")
  .action(runContractsList);

contracts
  .command("show <id>")
  .description("Show contract details")
  .action(runContractsShow);

const properties = program.command("properties").description("Property ledger");

properties
  .command("list")
  .description("List all properties")
  .option("--type <type>", `Filter by type (${PROPERTY_TYPES.join(", ")})`)
  .action(runPropertiesList);

properties
  .command("show <id>")
  .description("Show property details")
  .action(runPropertiesShow);

const finances = program.command("finances").description("Monthly finances");

finances
  .command("summary")
  .description("Summarize finances for a period")
  .requiredOption("--from <month>", "Start month (YYYY-MM)")
  .requiredOption("--to <month>", "End month (YYYY-MM)")
  .action(runFinancesSummary);

finances
  .command("add")
  .description("Add monthly finance entry from file")
  .requiredOption("--month <month>", "Month (YYYY-MM)")
  .requiredOption("--file <path>", "YAML file path")
  .action(runFinancesAdd);

finances
  .command("list")
  .description("List all monthly finance entries")
  .action(runFinancesList);

finances
  .command("show <month>")
  .description("Show monthly finance details")
  .action(runFinancesShow);

program
  .command("forecast")
  .description("Cash flow forecast")
  .option("-m, --months <number>", "Number of months to forecast", "12")
  .option("-f, --format <format>", "Output format (markdown|json)", "markdown")
  .option("-o, --output <filename>", "Save to docs/reports/forecast/")
  .action((opts) =>
    runForecast({
      months: parseInt(opts.months, 10),
      format: opts.format,
      output: opts.output,
    })
  );

const analyze = program.command("analyze").description("Analysis commands");

analyze
  .command("property")
  .description("Property-level revenue analysis")
  .option("--id <propertyId>", "Filter by property ID")
  .option("--period <period>", "Period (YYYY-QN or YYYY)")
  .option("-o, --output <filename>", "Save to docs/reports/analyze/")
  .action(runAnalyzeProperty);

program
  .command("scenario")
  .description("Scenario analysis")
  .option("-n, --name <name>", "Scenario name", "カスタムシナリオ")
  .option("-m, --months <number>", "Forecast months", "12")
  .option("--vacancy-rate <rate>", "Vacancy rate override (0-1)", parseFloat)
  .option("--occupancy-rate <rate>", "Occupancy rate override (0-1)", parseFloat)
  .option("--adr <change>", "ADR change (e.g. -10%)")
  .option("--rent-change <change>", "Rent change (e.g. -5%)")
  .option("--interest-rate <change>", "Interest rate change (e.g. 0.5%)")
  .option("-o, --output <filename>", "Save to docs/reports/scenario/")
  .action(runScenarioCommand);

program
  .command("alerts")
  .description("Contract deadline alerts")
  .option("-d, --days <number>", "Days ahead to scan", "90")
  .option("--risk-level <level>", "Filter by risk level (low|medium|high)")
  .option("--markdown", "Output as markdown")
  .option("-o, --output <filename>", "Save to docs/reports/alerts/")
  .action((opts) =>
    runAlerts({
      days: parseInt(opts.days, 10),
      riskLevel: opts.riskLevel,
      output: opts.output,
      markdown: opts.markdown,
    })
  );

const report = program.command("report").description("Report generation");

report
  .command("monthly")
  .description("Generate monthly report")
  .option("--month <month>", "Target month (YYYY-MM)")
  .option("-o, --output <filename>", "Output filename")
  .action(runReportMonthly);

report
  .command("kessan")
  .description("Generate 決算報告書 PDF")
  .option("--fy <fiscalYear>", "Fiscal year (e.g. FY2026)", "FY2026")
  .option("-o, --output <filename>", "Output filename or path")
  .action((opts) => runReportKessan({ fy: opts.fy, output: opts.output }));

report
  .command("jigyo")
  .description("Generate 事業報告書 PDF")
  .option("--fy <fiscalYear>", "Fiscal year (e.g. FY2026)", "FY2026")
  .option("-o, --output <filename>", "Output filename or path")
  .action((opts) => runReportJigyo({ fy: opts.fy, output: opts.output }));

report
  .command("annual")
  .description("Generate 決算報告書 and 事業報告書 PDFs")
  .option("--fy <fiscalYear>", "Fiscal year (e.g. FY2026)", "FY2026")
  .action((opts) => runReportAnnual({ fy: opts.fy }));

program.parse();
