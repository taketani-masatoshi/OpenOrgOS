#!/usr/bin/env node
import "./bootstrap-tenant.js";
import { Command } from "commander";
import { runValidate } from "./commands/validate.js";
import {
  runClassificationCheck,
  runClassificationAccess,
} from "./commands/classification.js";
import {
  runBrokerBankList,
  runBrokerBankShow,
  runBrokerTransfer,
} from "./commands/broker.js";
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
  runFinancesVariance,
} from "./commands/finances.js";
import { runMigrateYojitsu } from "./commands/migrate.js";
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
import { runInvoiceGenerateCommand } from "./commands/invoice.js";
import { runModulesList, runModulesSyncContext, runModulesCheck, runModulesCheckAll } from "./commands/modules.js";
import { runOpsDaily, runOpsP0 } from "./commands/ops.js";
import { runSkillsList, runSkill } from "./commands/skills.js";
import {
  runRouteList,
  runRouteMatch,
  runRouteSuggest,
  runRouteHandoff,
  runRouteDispatch,
} from "./commands/route.js";
import {
  runEscalatePlan,
  runEscalateRun,
  runEscalateStatus,
  runEscalateComplete,
} from "./commands/escalate.js";
import { runClassificationAccess } from "./commands/classification.js";
import { runMapList, runMapResolve, runMapTree } from "./commands/map.js";
import { runPipelineDaily, runPipelineList } from "./commands/pipeline.js";
import { runTenantInitCommand } from "./commands/tenant.js";
import {
  runRegulationsList,
  runRegulationsEffective,
  runRegulationsSeed,
} from "./commands/regulations.js";
import { runStandardsList, runStandardsEnabled } from "./commands/standards.js";

const program = new Command();

program
  .name("steward")
  .description("Steward OS - Property Business Edition CLI")
  .version("0.2.0")
  .option("--tenant <id>", "Tenant instance (env: STEWARD_TENANT; default from tenant.yaml)");

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

const modulesCmd = program
  .command("modules")
  .description("Business module catalog and tenant bindings");

modulesCmd
  .command("list")
  .description("List steward/modules catalog vs tenant modules.yaml")
  .action(runModulesList);

modulesCmd
  .command("sync-context")
  .description("Regenerate active_context.md and tenant-active-context.mdc")
  .action(runModulesSyncContext);

modulesCmd
  .command("check [id]")
  .description("Verify module manifest seeds exist (no tenant data required)")
  .option("--all", "Check all catalog modules (production_ready: full · seed_only: skeleton)")
  .action((id: string | undefined, opts: { all?: boolean }) => {
    if (opts.all) {
      runModulesCheckAll();
      return;
    }
    if (!id) {
      console.error("Provide a module id or use --all");
      process.exit(1);
    }
    runModulesCheck(id);
  });

const mapCmd = program.command("map").description("Logical → physical path map (tenant · framework)");

mapCmd
  .command("list")
  .description("List common logical paths for active tenant")
  .action(runMapList);

mapCmd
  .command("resolve <path>")
  .description("Resolve one logical path (e.g. data/company.yaml)")
  .action(runMapResolve);

mapCmd
  .command("tree")
  .description("Tenant map tree (enabled modules · dependency-graph nodes)")
  .action(runMapTree);

const pipelineCmd = program.command("pipeline").description("Automation pipelines (Cursor-external)");

pipelineCmd
  .command("list")
  .description("List available pipelines")
  .action(runPipelineList);

pipelineCmd
  .command("run <name>")
  .description("Run a pipeline (daily: validate → ops daily → dashboard)")
  .option("--tenant <id>", "Tenant id")
  .option("--skip-validate", "Skip validate step")
  .action((name, opts) => {
    if (name === "daily") {
      runPipelineDaily({ tenant: opts.tenant, skipValidate: opts.skipValidate });
      return;
    }
    console.error(`Unknown pipeline: ${name}`);
    process.exit(1);
  });

const tenantCmd = program.command("tenant").description("Tenant instance management");

tenantCmd
  .command("init <id>")
  .description("Initialize tenant from _template with skeleton data")
  .option("--name <name>", "Display / legal name")
  .option("--from <modules...>", "Enable only these modules (e.g. rental)")
  .option("--force", "Overwrite existing tenant directory")
  .option("--no-validate", "Skip validate after init")
  .action((id, opts) =>
    runTenantInitCommand(id, {
      name: opts.name,
      from: opts.from,
      force: opts.force,
      validate: opts.validate,
    })
  );

const regulationsCmd = program
  .command("regulations")
  .description("Regulation catalog and tenant effective docs");

regulationsCmd.command("list").description("List catalog vs tenant regulations").action(runRegulationsList);

regulationsCmd.command("effective").description("List effective regulation IDs").action(runRegulationsEffective);

regulationsCmd
  .command("seed")
  .description("Copy effective regulation templates to docs/company/regulations/")
  .option("--force", "Overwrite existing tenant docs")
  .option("--dry-run", "Print what would be seeded")
  .option("--id <regId>", "Seed single regulation (repeatable)", (v: string, prev: string[]) => [...prev, v], [])
  .action((opts) =>
    runRegulationsSeed({
      force: opts.force,
      dryRun: opts.dryRun,
      ids: opts.id?.length ? opts.id : undefined,
    })
  );

const standardsCmd = program.command("standards").description("ISO standards catalog");

standardsCmd.command("list").description("List ISO catalog vs tenant standards.yaml").action(runStandardsList);

standardsCmd.command("enabled").description("List enabled ISO standard IDs").action(runStandardsEnabled);

const opsCmd = program.command("ops").description("Operational daily checks (P0 · contracts · maturity)");

opsCmd.command("daily").description("Daily ops summary (maturity + P0 + contract alerts)").action(runOpsDaily);

opsCmd.command("p0").description("P0 closing blockers only (exit 1 if open)").action(runOpsP0);

const routeCmd = program.command("route").description("Agent inter-routing (registry · access · handoff)");

routeCmd.command("list").description("List static route registry").action(runRouteList);

routeCmd
  .command("match")
  .description("Match routes by --text and/or --path")
  .option("--text <text>", "User intent or message text")
  .option("--path <path>", "Resource path (logical)")
  .option("--json", "JSON output")
  .action((opts) => runRouteMatch({ text: opts.text, path: opts.path, json: opts.json }));

routeCmd
  .command("access")
  .description("Check agent access via classification-registry")
  .requiredOption("--agent <id>", "Agent id (e.g. secretary)")
  .requiredOption("--path <path>", "Resource path")
  .option("--operation <op>", "read | write | export", "read")
  .action((opts) => runClassificationAccess(opts.agent, opts.path, opts.operation));

routeCmd
  .command("suggest")
  .description("Suggest handoff card (console)")
  .option("--from <agent>", "Source agent", "steward")
  .option("--to <agent>", "Target agent (override match)")
  .option("--skill <id>", "Skill id (override match)")
  .option("--text <text>", "Intent text for match")
  .option("--path <path>", "Path for match")
  .option("--route-id <id>", "Force route id from registry")
  .option("--mode <mode>", "suggest | auto", "suggest")
  .option("--json", "JSON output")
  .action((opts) =>
    runRouteSuggest({
      from: opts.from,
      to: opts.to,
      skill: opts.skill,
      text: opts.text,
      path: opts.path,
      routeId: opts.routeId,
      mode: opts.mode,
      json: opts.json,
    })
  );

routeCmd
  .command("handoff")
  .description("Write handoff YAML/MD to docs/reports/routing-queue/")
  .option("--from <agent>", "Source agent", "steward")
  .option("--to <agent>", "Target agent (override match)")
  .option("--skill <id>", "Skill id")
  .option("--text <text>", "Intent text for match")
  .option("--path <path>", "Path for match")
  .option("--route-id <id>", "Force route id")
  .option("--mode <mode>", "suggest | auto", "suggest")
  .option("--notes <text>", "Optional notes")
  .action((opts) =>
    runRouteHandoff({
      from: opts.from,
      to: opts.to,
      skill: opts.skill,
      text: opts.text,
      path: opts.path,
      routeId: opts.routeId,
      mode: opts.mode,
      notes: opts.notes,
    })
  );

routeCmd
  .command("dispatch")
  .description("Dispatch handoff by id (suggest default; auto runs skills CLI)")
  .requiredOption("--id <id>", "Handoff id (HO-... or IMP-...)")
  .option("--mode <mode>", "suggest | auto | implement")
  .action((opts) => runRouteDispatch({ id: opts.id, mode: opts.mode }));

const escalateCmd = program
  .command("escalate")
  .description("Delegation / work orders (implement task routing)");

escalateCmd
  .command("plan")
  .description("Plan work orders from request text (dry-run default)")
  .option("--text <text>", "Request or structured escalation input")
  .option("--path <path>", "Resource path for route match")
  .option("--subject <text>", "Work order subject")
  .option("--background <text>", "Background context")
  .option("--requirements <text>", "Implementation requirements")
  .option("--deliverable <d>", "Deliverable (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
  .option("--acceptance <c>", "Acceptance criterion (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
  .option("--priority <p>", "P0 | P1 | P2 | P3")
  .option("--tenant <id>", "Tenant id")
  .option("--dry-run", "Plan only (default)", true)
  .option("--json", "JSON output")
  .action((opts) =>
    runEscalatePlan({
      text: opts.text,
      path: opts.path,
      subject: opts.subject,
      background: opts.background,
      requirements: opts.requirements,
      deliverables: opts.deliverable,
      acceptance: opts.acceptance,
      priority: opts.priority,
      tenant: opts.tenant,
      dryRun: opts.dryRun,
      json: opts.json,
    })
  );

escalateCmd
  .command("run")
  .description("Generate work orders + agent implementation prompt MD")
  .option("--text <text>", "Request text")
  .option("--path <path>", "Resource path")
  .option("--subject <text>", "Subject")
  .option("--background <text>", "Background")
  .option("--requirements <text>", "Requirements")
  .option("--deliverable <d>", "Deliverable", (v: string, prev: string[]) => [...prev, v], [] as string[])
  .option("--acceptance <c>", "Acceptance criterion", (v: string, prev: string[]) => [...prev, v], [] as string[])
  .option("--priority <p>", "P0 | P1 | P2 | P3")
  .option("--from <agent>", "Source agent", "executive_steward")
  .option("--tenant <id>", "Tenant id")
  .option("--id <id>", "Regenerate prompts from existing HO-/IMP- id")
  .action((opts) =>
    runEscalateRun({
      text: opts.text,
      path: opts.path,
      subject: opts.subject,
      background: opts.background,
      requirements: opts.requirements,
      deliverables: opts.deliverable,
      acceptance: opts.acceptance,
      priority: opts.priority,
      from: opts.from,
      tenant: opts.tenant,
      id: opts.id,
    })
  );

escalateCmd
  .command("status")
  .description("List work orders in routing-queue")
  .option("--pending", "Pending only")
  .option("--blocked", "Blocked only")
  .option("--json", "JSON output")
  .action((opts) => runEscalateStatus({ pending: opts.pending, blocked: opts.blocked, json: opts.json }));

escalateCmd
  .command("complete")
  .description("Mark work order completed")
  .requiredOption("--id <id>", "Work order id (IMP-...)")
  .option("--notes <text>", "Completion notes")
  .action((opts) => runEscalateComplete({ id: opts.id, notes: opts.notes }));

const skillsCmd = program.command("skills").description("Run Agent Skills from CLI (no Cursor)");

skillsCmd.command("list").description("List skill CLI commands").action(runSkillsList);

skillsCmd
  .command("run <id>")
  .description("Run skill: contract-expiry | permit-expiry | monthly-close | variance | records-check | p0 | daily")
  .option("-d, --days <number>", "Days ahead (contract-expiry)", "90")
  .option("-m, --month <YYYY-MM>", "Target month (monthly-close)")
  .option("--markdown", "Markdown output where supported")
  .option("-o, --output <filename>", "Save report under docs/reports/")
  .action((id, opts) =>
    runSkill(id, {
      days: opts.days ? parseInt(opts.days, 10) : undefined,
      month: opts.month,
      markdown: opts.markdown,
      output: opts.output,
    })
  );

program
  .command("status")
  .description("Maturity report (preparedness / operational / automation)")
  .option("--markdown", "Markdown output")
  .option("--verbose", "Include integrity warnings")
  .option("--legacy", "Append legacy data-health breakdown")
  .option("-o, --output <filename>", "Save to docs/reports/status/")
  .action((opts) =>
    runStatus({
      markdown: opts.markdown,
      verbose: opts.verbose,
      legacy: opts.legacy,
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
  .command("access")
  .description("Check if an agent may access a resource path")
  .requiredOption("--agent <id>", "Agent id (e.g. finance)")
  .requiredOption("--path <path>", "Resource path (e.g. data/finance/bank-accounts.yaml)")
  .option("--operation <op>", "read | write | export", "read")
  .action((opts) => runClassificationAccess(opts.agent, opts.path, opts.operation));

const broker = program.command("broker").description("Capability broker — L2 口座をチャットに出さない");

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

program.parse();
