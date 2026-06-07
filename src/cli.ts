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
import { runDashboard } from "./commands/dashboard.js";
import { runStatus } from "./commands/status.js";
import { runSyncAll, runSyncContracts } from "./commands/sync.js";
import {
  runIoStatus,
  runIoInboxList,
  runIoInboxAdd,
  runIoInboxDone,
  runIoOutboxList,
  runIoOutboxAdd,
  runIoOutboxPrinted,
  runIoOutboxScan,
  runIoGuide,
} from "./commands/io.js";
import { runDepsCheck, runDepsGraph, runImpact } from "./commands/deps.js";
import { runInvoiceBancho } from "./commands/invoice.js";

const program = new Command();

program
  .name("steward")
  .description("Steward OS - Property Business Edition CLI")
  .version("0.2.0");

program
  .command("validate")
  .description("Validate all data files")
  .option("--warnings", "Show integrity warnings (non-fatal)")
  .option("--strict", "Alias for --warnings")
  .option("--deps", "Warn when downstream files are older than sources (dependency graph)")
  .action((opts) =>
    runValidate({
      warnings: opts.warnings || opts.strict,
      deps: opts.deps,
    })
  );

program
  .command("status")
  .description("Data maturity health report")
  .option("--markdown", "Markdown output")
  .option("--verbose", "Include integrity warnings")
  .option("-o, --output <filename>", "Save to docs/reports/status/")
  .action((opts) =>
    runStatus({
      markdown: opts.markdown,
      verbose: opts.verbose,
      output: opts.output,
    })
  );

const sync = program.command("sync").description("Sync docs/exports CSV from YAML");

sync
  .command("all")
  .description("Sync all plan CSVs and contract ledger")
  .action(runSyncAll);

sync
  .command("contracts")
  .description("Sync 契約管理表.csv only")
  .action(runSyncContracts);

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
  .command("dashboard")
  .description("経営ダッシュボード（オーナー向け日次サマリー）")
  .option("--no-markdown", "ファイル保存せずコンソールのみ")
  .option("-o, --output <filename>", "Save to docs/reports/dashboard/")
  .action((opts) =>
    runDashboard({
      markdown: opts.markdown,
      output: opts.output,
    })
  );

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
  .command("dashboard")
  .description("経営ダッシュボード（オーナー向け日次サマリー）")
  .option("--no-markdown", "ファイル保存せずコンソールのみ")
  .option("-o, --output <filename>", "Save to docs/reports/dashboard/")
  .action((opts) =>
    runDashboard({
      markdown: opts.markdown,
      output: opts.output,
    })
  );

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

const io = program.command("io").description("Document inbox/outbox (Input/Output)");

io.command("status").description("Inbox/outbox queue status").action(runIoStatus);

io.command("guide")
  .description("Print I/O workflow guide")
  .option("-o, --output <filename>", "Save to docs/reports/io/")
  .action((opts) => runIoGuide({ output: opts.output }));

const inbox = io.command("inbox").description("Incoming documents");

inbox.command("list").description("List inbox items").action(runIoInboxList);

inbox
  .command("add")
  .description("Register file to inbox (copy + queue)")
  .requiredOption("--from <path>", "Source file path")
  .requiredOption("--category <cat>", "contracts|licenses|applications|receipts|corporate|misc")
  .requiredOption("--title <title>", "Document title")
  .option("--source <source>", "scan|email|mail|download|other", "scan")
  .option("--related <id>", "Related CTR/REG id")
  .option("--notes <notes>", "Notes")
  .action((opts) =>
    runIoInboxAdd({
      from: opts.from,
      category: opts.category,
      title: opts.title,
      source: opts.source,
      related: opts.related,
      notes: opts.notes,
    })
  );

inbox
  .command("done <id>")
  .description("Mark inbox item processed")
  .option("--archive <path>", "Archive copy destination")
  .option("--output <path>", "Outbox PDF destination")
  .option("--notes <notes>", "Processing notes")
  .action((id, opts) =>
    runIoInboxDone({
      id,
      archive: opts.archive,
      output: opts.output,
      notes: opts.notes,
    })
  );

const outbox = io.command("outbox").description("Print-ready PDFs");

outbox.command("list").description("List pending outbox items").action(runIoOutboxList);

outbox
  .command("add")
  .description("Register PDF to outbox")
  .requiredOption("--from <path>", "PDF file path")
  .requiredOption("--category <cat>", "corporate|contracts|lodging|licenses|submissions|misc")
  .option("--purpose <purpose>", "print|submit|display", "print")
  .option("--title <title>", "Title")
  .option("--subdir <subdir>", "Subfolder under category")
  .action((opts) =>
    runIoOutboxAdd({
      from: opts.from,
      category: opts.category,
      purpose: opts.purpose,
      title: opts.title,
      subdir: opts.subdir,
    })
  );

outbox.command("scan").description("Register unlisted PDFs in outbox/").action(runIoOutboxScan);

outbox
  .command("printed <id>")
  .description("Mark outbox item as printed")
  .action(runIoOutboxPrinted);

const deps = program
  .command("deps")
  .description("Parameter dependency / impact propagation");

deps
  .command("check")
  .description("List downstream items to review after a file change")
  .option("--file <path>", "Changed file path (repo-relative or absolute)")
  .option("--markdown", "Markdown output")
  .option("-o, --output <filename>", "Save to docs/reports/deps/")
  .action((opts) =>
    runDepsCheck({
      file: opts.file,
      markdown: opts.markdown,
      output: opts.output,
    })
  );

deps
  .command("graph")
  .description("Print dependency relationship map (markdown)")
  .option("-o, --output <filename>", "Save to docs/reports/deps/")
  .action((opts) => runDepsGraph({ output: opts.output }));

program
  .command("impact <path>")
  .description("Alias for deps check — downstream impact of a changed file")
  .option("--markdown", "Markdown output")
  .option("-o, --output <filename>", "Save to docs/reports/deps/")
  .action((path, opts) =>
    runImpact(path, {
      file: path,
      markdown: opts.markdown,
      output: opts.output,
    })
  );

const invoice = program.command("invoice").description("Tenant invoice generation");

invoice
  .command("bancho")
  .description("Generate 番町ハイム312 rent invoices (PDF + email + MSG/EML)")
  .requiredOption("--from <month>", "Start billing month (YYYY-MM)")
  .requiredOption("--to <month>", "End billing month (YYYY-MM)")
  .option("--fy <fiscalYear>", "Fiscal year folder (e.g. FY2026)", "FY2026")
  .option("--tenant-name <name>", "Tenant name (default: placeholder)")
  .option("--tenant-email <email>", "Tenant email (default: placeholder)")
  .option("--bank-account <text>", "Bank transfer details (default: placeholder)")
  .action((opts) =>
    runInvoiceBancho({
      from: opts.from,
      to: opts.to,
      fy: opts.fy,
      tenantName: opts.tenantName,
      tenantEmail: opts.tenantEmail,
      bankAccount: opts.bankAccount,
    })
  );

program.parse();
