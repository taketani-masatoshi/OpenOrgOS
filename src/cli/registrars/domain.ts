import type { Command } from "commander";
import { runValidate } from "../../commands/validate.js";
import {
  runClassificationCheck,
  runClassificationAccess,
  runClassificationBoundaries,
} from "../../commands/classification.js";
import { runBrokerBankList, runBrokerBankShow, runBrokerTransfer } from "../../commands/broker.js";
import { runContractsList, runContractsShow, CONTRACT_TYPES } from "../../commands/contracts.js";
import { runPropertiesList, runPropertiesShow, PROPERTY_TYPES } from "../../commands/properties.js";
import {
  runFinancesSummary,
  runFinancesAdd,
  runFinancesList,
  runFinancesShow,
  runFinancesVariance,
} from "../../commands/finances.js";
import { runMigrateYojitsu } from "../../commands/migrate.js";
import { runAnalyzeProperty } from "../../commands/analyze.js";
import { runScenarioCommand } from "../../commands/scenario.js";
import { runAlerts } from "../../commands/alerts.js";
import {
  runReportMonthly,
  runReportKessan,
  runReportJigyo,
  runReportAnnual,
} from "../../commands/report.js";
import { runDashboard } from "../../commands/dashboard.js";
import { runSyncAll, runSyncContracts } from "../../commands/sync.js";
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
} from "../../commands/io.js";
import {
  runEventsArchive,
  runEventsChainBackfill,
  runEventsChainTail,
  runEventsChainVerify,
  runEventsChainMaterialize,
  runEventsClose,
  runEventsEnsureMonth,
  runEventsLinkOutbox,
  runEventsList,
  runEventsNew,
  runEventsRegisterArtifact,
  runEventsStatus,
  runEventsValidate,
  runEventsChainAttest,
  runEventsAuditMonthly,
} from "../../commands/company-events.js";
import { COMPANY_EVENT_KINDS } from "../../lib/company-events.js";
import { runDepsCheck, runDepsGraph, runImpact } from "../../commands/deps.js";
import { runInvoiceGenerateCommand } from "../../commands/invoice.js";
import { runForecast } from "../../commands/forecast.js";

export function registerDomainCommands(program: Command): void {
  program
    .command("validate")
    .description("Validate all data files")
    .option("--warnings", "Show integrity warnings (non-fatal)")
    .option("--strict", "Alias for --warnings")
    .option("--deps", "Warn when downstream files are older than sources (dependency graph)")
    .option("--security", "Run operator registry and auth security checks")
    .action((opts) =>
      runValidate({
        warnings: opts.warnings || opts.strict,
        deps: opts.deps,
        security: opts.security,
      })
    );

  const sync = program.command("sync").description("Sync docs/exports CSV from YAML");
  sync.command("all").description("Sync all plan CSVs and contract ledger").action(runSyncAll);
  sync.command("contracts").description("Sync 契約管理表.csv only").action(runSyncContracts);

  const contracts = program.command("contracts").description("Contract ledger");
  contracts
    .command("list")
    .description("List all contracts")
    .option("--type <type>", `Filter by type (${CONTRACT_TYPES.join(", ")})`)
    .option("--property <id>", "Filter by property ID")
    .action(runContractsList);
  contracts.command("show <id>").description("Show contract details").action(runContractsShow);

  const properties = program.command("properties").description("Property ledger");
  properties
    .command("list")
    .description("List all properties")
    .option("--type <type>", `Filter by type (${PROPERTY_TYPES.join(", ")})`)
    .action(runPropertiesList);
  properties.command("show <id>").description("Show property details").action(runPropertiesShow);

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
  finances.command("list").description("List all monthly finance entries").action(runFinancesList);
  finances
    .command("show <month>")
    .description("Show monthly finance details")
    .action(runFinancesShow);
  finances
    .command("variance")
    .description("FY plan vs monthly YAML revenue variance")
    .option("-o, --output <filename>", "Save to docs/plans/variance/")
    .action((opts) => runFinancesVariance({ output: opts.output }));

  const migrate = program.command("migrate").description("Data migrations");
  migrate
    .command("yojitsu")
    .description("Convert yojitsu v1 columns to v2 lines[]")
    .requiredOption("--fy <fiscalYear>", "Fiscal year id (e.g. FY2026)")
    .option("--dry-run", "Print v2 YAML without writing")
    .option("--write", "Overwrite data/plans/yojitsu-{fy}.yaml")
    .action((opts) =>
      runMigrateYojitsu({
        fiscalYear: opts.fy,
        dryRun: opts.dryRun,
        write: opts.write,
      })
    );

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

  const events = program
    .command("events")
    .description("Company event records (events/ vs artifacts/)");
  events.command("status").description("Registry summary").action(runEventsStatus);
  events
    .command("ensure-month")
    .description("Create YYYY-MM folders under docs/company/events and artifacts")
    .option("--month <month>", "YYYY-MM (default: current month)")
    .option("--refresh-index", "Regenerate _INDEX.md from registry")
    .action((opts) => runEventsEnsureMonth({ month: opts.month, refreshIndex: opts.refreshIndex }));
  events
    .command("new")
    .description("Create event record + artifact folder")
    .requiredOption("--kind <kind>", COMPANY_EVENT_KINDS.join("|"))
    .requiredOption("--title <title>", "Event title")
    .option("--date <date>", "Occurred date YYYY-MM-DD (default: today)")
    .option("--slug <slug>", "Latin slug (a-z0-9-, min 3 chars)")
    .option("--related <pairs>", "key:value,key:value (e.g. registration_case_id:INC-2026-001)")
    .option("--notes <notes>", "Registry notes")
    .action((opts) =>
      runEventsNew({
        kind: opts.kind,
        title: opts.title,
        date: opts.date,
        slug: opts.slug,
        related: opts.related,
        notes: opts.notes,
      })
    );
  events
    .command("list")
    .description("List company events")
    .option("--month <month>", "Filter YYYY-MM")
    .option("--status <status>", "open|closed|archived|voided")
    .option("--json", "JSON output")
    .action((opts) =>
      runEventsList({
        month: opts.month,
        status: opts.status,
        json: opts.json,
      })
    );
  const eventsChain = events.command("chain").description("Company event hash chain");
  eventsChain
    .command("verify")
    .description("Verify hash chain integrity and registry cross-check")
    .option("--json", "JSON output")
    .action((opts) => runEventsChainVerify({ json: opts.json }));
  eventsChain
    .command("backfill")
    .description(
      "Rebuild create/status/void/wire links from registry (existing chain requires --force)"
    )
    .option("--force", "Overwrite existing chain file")
    .action((opts) => runEventsChainBackfill({ force: opts.force }));
  eventsChain
    .command("materialize")
    .description("Derive YAML + MD frontmatter from chain (never rewrites MD body)")
    .option("--check", "Reduce only; do not write derived views")
    .option("--json", "JSON output")
    .action((opts) => runEventsChainMaterialize({ check: opts.check, json: opts.json }));
  eventsChain
    .command("attest")
    .description("Verify hash chain then sign weekly batch attestation (Ed25519)")
    .option("--force", "Re-sign current ISO week even if attestation exists")
    .option("--json", "JSON output")
    .action((opts) => runEventsChainAttest({ force: opts.force, json: opts.json }));
  eventsChain
    .command("tail")
    .description("Show chain tail link")
    .action(() => runEventsChainTail());
  const eventsAudit = events.command("audit").description("Company events periodic audit");
  eventsAudit
    .command("monthly")
    .description("Monthly audit report + human notification (records_audit)")
    .option("--month <month>", "YYYY-MM (default: current month)")
    .option("--no-notify", "Skip webhook / OpenWebUI notification")
    .option("-o, --output <filename>", "Report filename under agent-summaries/records-audit/")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runEventsAuditMonthly({
        month: opts.month,
        notify: !opts.noNotify,
        output: opts.output,
        json: opts.json,
      })
    );
  events
    .command("close <id>")
    .description("Close company event (open → closed)")
    .action((id) => runEventsClose({ id }));
  events
    .command("archive <id>")
    .description("Archive company event (closed → archived, or open → archived)")
    .action((id) => runEventsArchive({ id }));
  events
    .command("validate")
    .description("Validate registry vs event MD and artifact folders")
    .option("--json", "JSON output")
    .action((opts) => runEventsValidate({ json: opts.json }));
  events
    .command("register-artifact <id>")
    .description("Register files in artifact index for event")
    .requiredOption("--files <names>", "Comma-separated filenames in artifact dir")
    .option("--kind <kind>", "Artifact kind label (default: generated-md)")
    .action((id, opts) => runEventsRegisterArtifact({ id, files: opts.files, kind: opts.kind }));
  events
    .command("link-outbox")
    .description("Link document-io outbox item to company event")
    .requiredOption("--event-id <id>", "EVT-*")
    .requiredOption("--outbox-id <id>", "OUT-*")
    .action((opts) => runEventsLinkOutbox({ eventId: opts.eventId, outboxId: opts.outboxId }));

  const deps = program.command("deps").description("Parameter dependency / impact propagation");
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
    .command("generate")
    .description("Generate rent invoices from module billing config (PDF + email + MSG/EML)")
    .requiredOption("--module <id>", "Module id (e.g. rental)")
    .requiredOption("--property <id>", "Property id (e.g. PROP-001)")
    .requiredOption("--from <month>", "Start billing month (YYYY-MM)")
    .requiredOption("--to <month>", "End billing month (YYYY-MM)")
    .option("--fy <fiscalYear>", "Fiscal year folder (e.g. FY2026)", "FY2026")
    .option("--dry-run", "Print output paths only (no PDF/email files)")
    .option("--tenant-name <name>", "Tenant name (default: modules.yaml or template)")
    .option("--tenant-email <email>", "Tenant email")
    .option("--bank-account <text>", "Bank transfer details")
    .option("--sender-email <email>", "Sender From address")
    .action((opts) =>
      runInvoiceGenerateCommand({
        module: opts.module,
        property: opts.property,
        from: opts.from,
        to: opts.to,
        fy: opts.fy,
        tenantName: opts.tenantName,
        tenantEmail: opts.tenantEmail,
        bankAccount: opts.bankAccount,
        senderEmail: opts.senderEmail,
        dryRun: opts.dryRun,
      })
    );

  const classification = program
    .command("classification")
    .description("Data classification registry and access control");
  classification
    .command("check")
    .description("Verify gitignore coverage and bank-account links")
    .option("--json", "JSON output")
    .action((opts) => runClassificationCheck({ json: opts.json }));
  classification
    .command("boundaries")
    .description("Show registry-driven AI ignore patterns (--check verifies drift)")
    .option("--check", "Exit 1 if .cursorignore/.cursorindexingignore drift from registry")
    .option("--json", "JSON output")
    .action((opts) => runClassificationBoundaries({ check: opts.check, json: opts.json }));
  classification
    .command("access")
    .description("Check if an agent may access a resource path")
    .requiredOption("--agent <id>", "Agent id (e.g. finance)")
    .requiredOption("--path <path>", "Resource path (e.g. data/finance/bank-accounts.yaml)")
    .option("--operation <op>", "read | write | export", "read")
    .action((opts) => runClassificationAccess(opts.agent, opts.path, opts.operation));

  const broker = program
    .command("broker")
    .description("Capability broker — L2 口座をチャットに出さない");
  broker
    .command("list")
    .description("List corporate bank accounts (redacted by default)")
    .option("--mode <mode>", "redacted | full", "redacted")
    .action((opts) => runBrokerBankList({ mode: opts.mode }));
  broker
    .command("bank")
    .description("Show one bank account by ID")
    .requiredOption("--id <id>", "BANK-001")
    .option("--mode <mode>", "redacted | full", "redacted")
    .action((opts) => runBrokerBankShow({ id: opts.id, mode: opts.mode }));
  broker
    .command("transfer")
    .description("Generate transfer instruction (masked account · dry-run default)")
    .requiredOption("--from <id>", "Source BANK-xxx")
    .requiredOption("--amount <yen>", "Amount in JPY", parseInt)
    .requiredOption("--payee <name>", "Payee name")
    .requiredOption("--reference <text>", "Transfer reference")
    .option("--stakeholder <stkId>", "STK-xxx for payee hints")
    .option("--confirm", "Mark as confirmed (not dry-run)")
    .option("--write", "Save to scratch/broker/ (gitignore)")
    .action((opts) =>
      runBrokerTransfer({
        from: opts.from,
        amount: opts.amount,
        payee: opts.payee,
        reference: opts.reference,
        stakeholderId: opts.stakeholder,
        dryRun: !opts.confirm,
        write: opts.write ?? false,
      })
    );
}
