import type { Command } from "commander";
import { runValidate } from "../../commands/validate.js";
import {
  runClassificationCheck,
  runClassificationAccess,
  runClassificationBoundaries,
} from "../../commands/classification.js";
import {
  runBrokerBankList,
  runBrokerBankShow,
  runBrokerTransfer,
} from "../../commands/broker.js";
import {
  runContractsList,
  runContractsShow,
  runContractsSummary,
  CONTRACT_TYPES,
} from "../../commands/contracts.js";
import {
  runSalesList,
  runSalesShow,
  runSalesSummary,
  runSalesForecast,
  runSalesCustomers,
  runSalesCustomersView,
  runSalesPipelineView,
  runSalesInbound,
  runSalesInboundView,
  runSalesInboundIntake,
  runSalesOutbound,
  runSalesOutboundView,
  runSalesMigrateAccounts,
  runSalesDealSetStage,
  runSalesDealSetNextAction,
  runSalesDealCreate,
  runSalesDealUpdate,
  runSalesInquiryPromote,
  runSalesInquirySetStatus,
  runSalesClassify,
  runSalesMailLink,
  runSalesMailLinkResolve,
  runSalesHandoffWon,
  runSalesQuoteCreate,
  runSalesQuoteSetStatus,
  runSalesDemoOpen,
  runSalesDraftOutreach,
  runSalesDraftInquiryResponse,
  runSalesCrmDashboard,
  runSalesFollowUpFromSent,
  runSalesAccountMerge,
  SALES_DEAL_STAGES,
} from "../../commands/sales.js";
import {
  runPropertiesList,
  runPropertiesShow,
  PROPERTY_TYPES,
} from "../../commands/properties.js";
import {
  runFinancesSummary,
  runFinancesAdd,
  runFinancesReconcile,
  runFinancesList,
  runFinancesShow,
  runFinancesVariance,
  runFinancesBriefing,
  runFinancesCashBalance,
} from "../../commands/finances.js";
import { runFinancesCapitalRaiseCrossCheck } from "../../commands/finances-capital-raise-crosscheck.js";
import { runFinancesClose } from "../../commands/finances-close.js";
import {
  runTaxCalendar,
  runTaxCalendarView,
  runTaxConsumptionCalc,
  runTaxConsumptionCheck,
  runTaxConsumptionEligibility,
  runTaxDepreciation,
  runTaxGaps,
  runTaxHandoff,
  runTaxGapResolveCommand,
  runTaxInvoiceRegistrationCheck,
  runTaxQualifiedInvoiceCheck,
  runTaxReadiness,
} from "../../commands/tax.js";
import {
  runExpenseClaimApprove,
  runExpenseClaimGate,
  runExpenseClaimIngest,
  runExpenseClaimList,
  runExpenseClaimPrepareTransfer,
  runExpenseClaimReject,
  runExpenseClaimReimburse,
  runExpenseClaimRevision,
  runExpenseClaimShow,
} from "../../commands/expense-claim.js";
import {
  runBudgetAllocateDepartment,
  runBudgetAllocateMember,
  runBudgetRollover,
  runBudgetSetCompanyCategory,
  runBudgetShow,
} from "../../commands/budget.js";
import {
  runLedgerGl,
  runLedgerExport,
  runLedgerJournalBackfillTax,
  runLedgerJournalBackfillAudit,
  runLedgerJournalList,
  runLedgerMonthlyReconcile,
  runLedgerOpeningBalanceGenerate,
  runLedgerPost,
  runLedgerTrialBalance,
  runLedgerBalanceSheet,
  runLedgerSubsidiary,
  runLedgerReverse,
  runLedgerPeriodLock,
  runLedgerPeriodUnlock,
  runLedgerDenchoSearch,
  runLedgerDenchoCheck,
} from "../../commands/ledger.js";
import {
  runReceiptInit,
  runReceiptIssue,
  runReceiptList,
  runReceiptShow,
  runReceiptPdf,
  runReceiptVerify,
  runReceiptConfigShow,
} from "../../commands/receipt.js";
import { runMigrateYojitsu } from "../../commands/migrate.js";
import { runAnalyzeProperty } from "../../commands/analyze.js";
import { runScenarioCommand } from "../../commands/scenario.js";
import { runAlerts } from "../../commands/alerts.js";
import { runReportMonthly, runReportKessan, runReportJigyo, runReportAnnual } from "../../commands/report.js";
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
  runEventsAdopt,
  runEventsOrphans,
  runEventsChainBackfill,
  runEventsChainRepair,
  runEventsChainTail,
  runEventsChainVerify,
  runEventsChainPin,
  runEventsChainRotateKey,
  runEventsChainMigrate,
  runEventsChainExport,
  runEventsArchive,
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
  runEventsVoid,
  runEventsVoidAck,
  runEventsVoidRequest,
  runEventsWireStatus,
} from "../../commands/company-events.js";
import { COMPANY_EVENT_KINDS } from "../../lib/company-events.js";
import { runDepsCheck, runDepsGraph, runImpact } from "../../commands/deps.js";
import { runChangePlan, runChangeApply } from "../../commands/change.js";
import { runInvoiceGenerateCommand } from "../../commands/invoice.js";
import { runForecast } from "../../commands/forecast.js";
import {
  runHrCompetence,
  runHrCompetenceCheck,
  runHrHeadcount,
  type CompetenceView,
} from "../../commands/hr.js";
import {
  runPmoMilestones,
  runPmoPortfolio,
  runPmoRisks,
  runPmoShow,
} from "../../commands/pmo.js";
import {
  runAnalyticsKpi,
  runAnalyticsMetrics,
  runAnalyticsQuality,
  runAnalyticsSnapshot,
} from "../../commands/analytics.js";

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

  const hr = program.command("hr").description("HR master (L1 headcount)");
  hr.command("headcount")
    .description("Deterministic headcount from data/hr/employees.yaml (no names)")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runHrHeadcount({ json: Boolean(opts.json) }));

  const competence = hr
    .command("competence")
    .description("力量マップ・研修計画・実施記録（ISO 21401 7.2）");
  for (const [name, desc] of [
    ["map", "力量マップと要求未達ギャップ"],
    ["plan", "研修計画と力量ギャップの充足状況"],
    ["records", "研修実施記録と追加措置"],
  ] as const) {
    competence
      .command(name)
      .description(desc)
      .option("--json", "Print JSON")
      .option("--write", `docs/compliance/iso/ISO-21401/competence/ に書き出す`)
      .action((opts: { json?: boolean; write?: boolean }) =>
        runHrCompetence(name as CompetenceView, {
          json: Boolean(opts.json),
          write: Boolean(opts.write),
        }),
      );
  }
  competence
    .command("check")
    .description("力量マップと研修計画の整合を検査（法定ギャップ未計画で異常終了）")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) =>
      runHrCompetenceCheck({ json: Boolean(opts.json) }),
    );

  const pmo = program.command("pmo").description("PMO portfolio (L1 RAG · milestones · risks)");
  pmo
    .command("portfolio")
    .description("List projects with RAG counts (no amounts or names)")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runPmoPortfolio({ json: Boolean(opts.json) }));
  pmo
    .command("milestones")
    .description("Overdue and upcoming milestones")
    .option("--days <n>", "Upcoming horizon days (default 14)", "14")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean; days?: string }) =>
      runPmoMilestones({
        json: Boolean(opts.json),
        days: opts.days ? Number(opts.days) : 14,
      })
    );
  pmo
    .command("risks")
    .description("Open project risks")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runPmoRisks({ json: Boolean(opts.json) }));
  pmo
    .command("show <id>")
    .description("Show one PRJ-* (link ids only)")
    .option("--json", "Print JSON")
    .action((id: string, opts: { json?: boolean }) =>
      runPmoShow(id, { json: Boolean(opts.json) })
    );

  const analytics = program.command("analytics").description("KPI catalog and scorecard");
  analytics
    .command("metrics")
    .description("List metric definitions and resolver availability")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runAnalyticsMetrics({ json: Boolean(opts.json) }));
  analytics
    .command("kpi")
    .description("KPI scorecard — target vs actual with RAG")
    .option("--json", "Print JSON")
    .option("--fy <fiscalYear>", "Fiscal year label", "FY2026")
    .action((opts: { json?: boolean; fy?: string }) =>
      runAnalyticsKpi({ json: Boolean(opts.json), fiscalYear: opts.fy })
    );
  analytics
    .command("quality")
    .description("Data quality report (computeDataHealth)")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runAnalyticsQuality({ json: Boolean(opts.json) }));
  analytics
    .command("snapshot")
    .description("Write monthly KPI snapshot to docs/analytics/snapshots/")
    .option("--month <YYYY-MM>", "Snapshot month label")
    .option("--as-of <YYYY-MM-DD>", "Resolve metric values as of this date")
    .option("-o, --output <filename>", "Output filename under snapshots/")
    .option("--force", "Backfill a different month and overwrite existing history")
    .action((opts: { month?: string; asOf?: string; output?: string; force?: boolean }) =>
      runAnalyticsSnapshot({
        month: opts.month,
        asOf: opts.asOf,
        output: opts.output,
        force: Boolean(opts.force),
      })
    );

  const contracts = program.command("contracts").description("Contract ledger");
  contracts
    .command("list")
    .description("List all contracts")
    .option("--type <type>", `Filter by type (${CONTRACT_TYPES.join(", ")})`)
    .option("--property <id>", "Filter by property ID")
    .action(runContractsList);
  contracts.command("show <id>").description("Show contract details").action(runContractsShow);
  contracts
    .command("summary")
    .description("Executive contract portfolio (counts, expiry, exit windows)")
    .option("--days <n>", "Horizon days (default 90)", "90")
    .option("--json", "Print JSON")
    .action((opts: { days?: string; json?: boolean }) =>
      runContractsSummary({
        days: opts.days ? Number(opts.days) : 90,
        json: Boolean(opts.json),
      })
    );

  const sales = program.command("sales").description("Sales pipeline and CRM SoT");
  sales
    .command("list")
    .description("List pipeline deals")
    .option("--stage <stage>", `Filter by stage (${SALES_DEAL_STAGES.join(", ")})`)
    .option("--open", "Open deals only")
    .option("--include-demo", "Include demo deals")
    .action((opts: { stage?: string; open?: boolean; includeDemo?: boolean }) =>
      runSalesList({
        stage: opts.stage,
        openOnly: Boolean(opts.open),
        includeDemo: Boolean(opts.includeDemo),
      })
    );
  sales.command("show <id>").description("Show deal details").action(runSalesShow);
  sales
    .command("summary")
    .description("Executive sales pipeline (counts, weighted pipeline, alerts)")
    .option("--days <n>", "Action horizon days (default 14)", "14")
    .option("--stale-days <n>", "Stale stage threshold days (default 14)", "14")
    .option("--include-demo", "Include demo deals in counts")
    .option("--json", "Print JSON")
    .action((opts: {
      days?: string;
      staleDays?: string;
      includeDemo?: boolean;
      json?: boolean;
    }) =>
      runSalesSummary({
        days: opts.days ? Number(opts.days) : 14,
        staleDays: opts.staleDays ? Number(opts.staleDays) : 14,
        includeDemo: Boolean(opts.includeDemo),
        json: Boolean(opts.json),
      })
    );
  sales
    .command("forecast")
    .description("Weighted forecast for target close month")
    .option("--month <YYYY-MM>", "Target month")
    .option("--include-demo", "Include demo deals")
    .option("--json", "Print JSON")
    .action((opts: { month?: string; includeDemo?: boolean; json?: boolean }) =>
      runSalesForecast({
        month: opts.month,
        includeDemo: Boolean(opts.includeDemo),
        json: Boolean(opts.json),
      })
    );
  sales
    .command("customers")
    .description("Customer success health and renewal windows")
    .option("--days <n>", "Renewal horizon days (default 90)", "90")
    .option("--include-demo", "Include demo accounts")
    .option("--scores", "Include health score table")
    .option("--drift-only", "Show accounts with health drift only")
    .option("--json", "Print JSON")
    .action((opts: {
      days?: string;
      includeDemo?: boolean;
      scores?: boolean;
      driftOnly?: boolean;
      json?: boolean;
    }) =>
      runSalesCustomers({
        days: opts.days ? Number(opts.days) : 90,
        includeDemo: Boolean(opts.includeDemo),
        scores: Boolean(opts.scores),
        driftOnly: Boolean(opts.driftOnly),
        json: Boolean(opts.json),
      })
    );
  sales
    .command("customers-view")
    .description("Canvas view model for customer success board")
    .option("--include-demo", "Include demo accounts")
    .option("--days <n>", "Renewal horizon days (default 90)", "90")
    .option("--json", "Print JSON")
    .action((opts: { includeDemo?: boolean; days?: string; json?: boolean }) =>
      runSalesCustomersView({
        includeDemo: Boolean(opts.includeDemo),
        horizonDays: opts.days ? Number(opts.days) : 90,
        json: Boolean(opts.json),
      })
    );
  sales
    .command("pipeline-view")
    .description("Canvas view model for sales pipeline board")
    .option("--include-demo", "Include demo deals")
    .option("--json", "Print JSON")
    .action((opts: { includeDemo?: boolean; json?: boolean }) =>
      runSalesPipelineView({
        includeDemo: Boolean(opts.includeDemo),
        json: Boolean(opts.json),
      })
    );
  const inbound = sales
    .command("inbound")
    .description("Inbound inquiry queue (counts, SLA alerts)")
    .option("--days <n>", "Action horizon days (default 7)", "7")
    .option("--stale-days <n>", "First-response SLA days (default 3)", "3")
    .option("--include-demo", "Include demo inquiries")
    .option("--json", "Print JSON");
  inbound.action((opts: {
    days?: string;
    staleDays?: string;
    includeDemo?: boolean;
    json?: boolean;
  }) =>
    runSalesInbound({
      days: opts.days ? Number(opts.days) : 7,
      staleDays: opts.staleDays ? Number(opts.staleDays) : 3,
      includeDemo: Boolean(opts.includeDemo),
      json: Boolean(opts.json),
    })
  );
  inbound
    .command("intake")
    .description("Create inquiries from mail triage (routing: sales_inbound)")
    .option("--dry-run", "Preview without writing")
    .action((opts: { dryRun?: boolean }) =>
      runSalesInboundIntake({ dryRun: Boolean(opts.dryRun) })
    );
  sales
    .command("inbound-view")
    .description("Canvas view model for inbound inquiry board")
    .option("--include-demo", "Include demo inquiries")
    .option("--json", "Print JSON")
    .action((opts: { includeDemo?: boolean; json?: boolean }) =>
      runSalesInboundView({
        includeDemo: Boolean(opts.includeDemo),
        json: Boolean(opts.json),
      })
    );
  sales
    .command("outbound")
    .description("Outbound campaign queue (counts, contact coverage, alerts)")
    .option("--days <n>", "Action horizon days (default 7)", "7")
    .option("--include-demo", "Include demo campaigns")
    .option("--json", "Print JSON")
    .action((opts: { days?: string; includeDemo?: boolean; json?: boolean }) =>
      runSalesOutbound({
        days: opts.days ? Number(opts.days) : 7,
        includeDemo: Boolean(opts.includeDemo),
        json: Boolean(opts.json),
      })
    );
  sales
    .command("outbound-view")
    .description("Canvas view model for outbound campaign board")
    .option("--include-demo", "Include demo campaigns")
    .option("--json", "Print JSON")
    .action((opts: { includeDemo?: boolean; json?: boolean }) =>
      runSalesOutboundView({
        includeDemo: Boolean(opts.includeDemo),
        json: Boolean(opts.json),
      })
    );

  sales
    .command("crm-dashboard")
    .description("Extended CRM dashboard (lead class, lost reasons, mail queue)")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runSalesCrmDashboard({ json: Boolean(opts.json) }));

  sales
    .command("migrate-accounts")
    .description("Migrate deal party → CUST/CONTACT + account_id")
    .option("--dry-run", "Preview only")
    .option("--json", "Print JSON")
    .action(async (opts: { dryRun?: boolean; json?: boolean }) => {
      const { requireCliDataWrite } = await import("../../lib/console-auth/cli-operator.js");
      requireCliDataWrite({ command: "sales migrate-accounts", permission: "escalate:plan" });
      runSalesMigrateAccounts({ dryRun: Boolean(opts.dryRun), json: Boolean(opts.json) });
    });

  const deal = sales.command("deal").description("Deal mutations");
  deal
    .command("create")
    .description("Create a new deal")
    .requiredOption("--title <text>", "Deal title")
    .option("--stage <stage>", "Initial stage", "lead")
    .option("--account-id <id>", "CUST id")
    .option("--counterparty <name>", "Company name when no account")
    .option("--owner <id>", "Owner id")
    .option("--owner-name <name>", "Owner display name")
    .option("--amount-man <n>", "Amount in 万円", (v) => Number(v))
    .action(async (opts: {
      title: string;
      stage?: string;
      accountId?: string;
      counterparty?: string;
      owner?: string;
      ownerName?: string;
      amountMan?: number;
    }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales deal create", permission: "escalate:plan" });
      runSalesDealCreate({
        title: opts.title,
        stage: opts.stage as (typeof SALES_DEAL_STAGES)[number],
        accountId: opts.accountId,
        counterparty: opts.counterparty,
        owner: opts.owner,
        owner_name: opts.ownerName ?? opts.owner ?? "operator",
        amount_man: opts.amountMan,
        actor: resolveCliOperatorId(),
      });
    });
  deal
    .command("set-stage <dealId>")
    .description("Transition deal stage")
    .requiredOption("--stage <stage>", "Target stage")
    .option("--lost-reason <reason>", "Required when stage=lost")
    .option("--lost-notes <text>", "Optional lost notes")
    .option("--reopen", "Reopen from terminal stage")
    .action(async (dealId: string, opts: {
      stage: string;
      lostReason?: string;
      lostNotes?: string;
      reopen?: boolean;
    }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      const permission = opts.stage === "won" || opts.reopen ? "chat:approve" : "escalate:plan";
      requireCliDataWrite({ command: "sales deal set-stage", permission });
      runSalesDealSetStage({
        dealId,
        stage: opts.stage as (typeof SALES_DEAL_STAGES)[number],
        lostReason: opts.lostReason as import("../../../schemas/sales.js").SalesLostReason | undefined,
        lostNotes: opts.lostNotes,
        reopen: Boolean(opts.reopen),
        actor: resolveCliOperatorId(),
      });
    });
  deal
    .command("set-next-action <dealId>")
    .description("Update next action and due date")
    .requiredOption("--action <text>", "Next action")
    .option("--due <YYYY-MM-DD>", "Due date")
    .action(async (dealId: string, opts: { action: string; due?: string }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales deal set-next-action", permission: "escalate:plan" });
      runSalesDealSetNextAction({
        dealId,
        nextAction: opts.action,
        due: opts.due,
        actor: resolveCliOperatorId(),
      });
    });
  deal
    .command("update <dealId>")
    .description("Patch deal fields (title, amount, probability, account)")
    .option("--title <text>", "Title")
    .option("--amount-man <n>", "Amount 万円", (v) => Number(v))
    .option("--probability <n>", "Probability 0-100", (v) => Number(v))
    .option("--account-id <id>", "CUST id")
    .option("--counterparty <name>", "Company short name")
    .option("--tags <csv>", "Comma-separated tags")
    .action(async (dealId: string, opts: {
      title?: string;
      amountMan?: number;
      probability?: number;
      accountId?: string;
      counterparty?: string;
      tags?: string;
    }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales deal update", permission: "escalate:plan" });
      runSalesDealUpdate({
        dealId,
        title: opts.title,
        amount_man: opts.amountMan,
        probability_pct: opts.probability,
        accountId: opts.accountId,
        counterparty: opts.counterparty,
        tags: opts.tags?.split(",").map((t) => t.trim()).filter(Boolean),
        actor: resolveCliOperatorId(),
      });
    });

  sales
    .command("inquiry-promote <inquiryId>")
    .description("Promote qualified inquiry to deal (human gate)")
    .option("--title <text>", "Deal title override")
    .action(async (inquiryId: string, opts: { title?: string }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales inquiry-promote", permission: "escalate:plan" });
      runSalesInquiryPromote({
        inquiryId,
        title: opts.title,
        actor: resolveCliOperatorId(),
      });
    });

  sales
    .command("inquiry-set-status <inquiryId>")
    .description("Transition inquiry status")
    .requiredOption("--status <status>", "new|triaged|responded|qualified|closed")
    .action(async (inquiryId: string, opts: { status: string }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales inquiry-set-status", permission: "escalate:plan" });
      runSalesInquirySetStatus({
        inquiryId,
        status: opts.status as import("../../../schemas/sales.js").SalesInquiryStatus,
        actor: resolveCliOperatorId(),
      });
    });

  sales
    .command("classify")
    .description("Lead classification suggestions")
    .option("--apply", "Write lead_class and confidence_pct")
    .option("--apply-probability", "Also update probability_pct")
    .option("--json", "Print JSON")
    .action(async (opts: { apply?: boolean; applyProbability?: boolean; json?: boolean }) => {
      const { requireCliDataWrite } = await import("../../lib/console-auth/cli-operator.js");
      if (opts.apply || opts.applyProbability) {
        requireCliDataWrite({ command: "sales classify", permission: "escalate:plan" });
      }
      runSalesClassify({
        apply: Boolean(opts.apply),
        applyProbability: Boolean(opts.applyProbability),
        json: Boolean(opts.json),
      });
    });

  sales
    .command("mail-link")
    .description("Link mail triage threads to deals/inquiries")
    .option("--json", "Print JSON")
    .action(async (opts: { json?: boolean }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales mail-link", permission: "escalate:plan" });
      runSalesMailLink({ json: Boolean(opts.json), actor: resolveCliOperatorId() });
    });

  sales
    .command("mail-link-resolve")
    .description("Resolve ambiguous mail link to a deal or inquiry")
    .requiredOption("--triage-id <id>", "Triage entry id")
    .option("--deal <id>", "DEAL id")
    .option("--inquiry <id>", "INQ id")
    .action(async (opts: { triageId: string; deal?: string; inquiry?: string }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales mail-link-resolve", permission: "escalate:plan" });
      runSalesMailLinkResolve({
        triageId: opts.triageId,
        dealId: opts.deal,
        inquiryId: opts.inquiry,
        actor: resolveCliOperatorId(),
      });
    });

  sales
    .command("follow-up-from-sent <dealId>")
    .description("Set follow-up next_action from sent correspondence draft")
    .requiredOption("--confirm", "Confirm mutation")
    .option("--dry-run", "Preview only")
    .option("--json", "Print JSON")
    .action(async (dealId: string, opts: { confirm?: boolean; dryRun?: boolean; json?: boolean }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales follow-up-from-sent", permission: "escalate:plan" });
      runSalesFollowUpFromSent({
        dealId,
        confirm: Boolean(opts.confirm),
        dryRun: Boolean(opts.dryRun),
        json: Boolean(opts.json),
        actor: resolveCliOperatorId(),
      });
    });

  const accountCmd = sales.command("account").description("Customer account mutations");
  accountCmd
    .command("merge")
    .description("Merge CUST into another (rewrites FK refs)")
    .requiredOption("--from <id>", "Source CUST id (removed)")
    .requiredOption("--into <id>", "Target CUST id (kept)")
    .option("--dry-run", "Preview only")
    .option("--json", "Print JSON")
    .action(async (opts: { from: string; into: string; dryRun?: boolean; json?: boolean }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales account merge", permission: "chat:approve" });
      runSalesAccountMerge({
        fromId: opts.from,
        intoId: opts.into,
        dryRun: Boolean(opts.dryRun),
        json: Boolean(opts.json),
        actor: resolveCliOperatorId(),
      });
    });

  sales
    .command("handoff-won <dealId>")
    .description("Promote account to customer after won deal")
    .option("--dry-run", "Preview only")
    .option("--json", "Print JSON")
    .action(async (dealId: string, opts: { dryRun?: boolean; json?: boolean }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales handoff-won", permission: "chat:approve" });
      runSalesHandoffWon({
        dealId,
        dryRun: Boolean(opts.dryRun),
        json: Boolean(opts.json),
        actor: resolveCliOperatorId(),
      });
    });

  const quote = sales.command("quote").description("Quote mutations");
  quote
    .command("create")
    .description("Create quote for deal")
    .requiredOption("--deal-id <id>", "DEAL id")
    .requiredOption("--account-id <id>", "CUST id")
    .option("--amount-man <n>", "Amount 万円", (v) => Number(v))
    .option("--doc-ref <path>", "docs/sales/quotes/ path")
    .action(async (opts: {
      dealId: string;
      accountId: string;
      amountMan?: number;
      docRef?: string;
    }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales quote create", permission: "escalate:plan" });
      runSalesQuoteCreate({
        dealId: opts.dealId,
        accountId: opts.accountId,
        amount_man: opts.amountMan,
        doc_ref: opts.docRef,
        actor: resolveCliOperatorId(),
      });
    });
  quote
    .command("set-status <quoteId>")
    .description("Update quote status")
    .requiredOption("--status <status>", "draft|sent|accepted|rejected|withdrawn")
    .action(async (quoteId: string, opts: { status: string }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      const permission = opts.status === "sent" ? "chat:approve" : "escalate:plan";
      requireCliDataWrite({ command: "sales quote set-status", permission });
      runSalesQuoteSetStatus({
        quoteId,
        status: opts.status as "draft" | "sent" | "accepted" | "rejected" | "withdrawn",
        actor: resolveCliOperatorId(),
      });
    });

  const demo = sales.command("demo").description("Sales demo scheduling");
  demo
    .command("open <dealId>")
    .description("Open scheduling case for product demo")
    .requiredOption("--name <text>", "Participant name")
    .option("--email <addr>", "Participant email")
    .action(async (dealId: string, opts: { name: string; email?: string }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales demo open", permission: "escalate:plan" });
      runSalesDemoOpen({
        dealId,
        name: opts.name,
        email: opts.email,
        actor: resolveCliOperatorId(),
      });
    });

  const draft = sales.command("draft").description("Sales correspondence drafts");
  draft
    .command("outreach")
    .description("Create outreach draft for deal")
    .requiredOption("--deal-id <id>", "DEAL id")
    .requiredOption("--to <email>", "Recipient")
    .requiredOption("--subject <text>", "Subject")
    .requiredOption("--body <text>", "Body")
    .action(async (opts: { dealId: string; to: string; subject: string; body: string }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales draft outreach", permission: "escalate:plan" });
      runSalesDraftOutreach({
        dealId: opts.dealId,
        to: opts.to,
        subject: opts.subject,
        body: opts.body,
        actor: resolveCliOperatorId() ?? "operator",
      });
    });
  draft
    .command("inquiry-response")
    .description("Create inquiry response draft")
    .requiredOption("--inquiry-id <id>", "INQ id")
    .requiredOption("--to <email>", "Recipient")
    .requiredOption("--subject <text>", "Subject")
    .requiredOption("--body <text>", "Body")
    .action(async (opts: {
      inquiryId: string;
      to: string;
      subject: string;
      body: string;
    }) => {
      const { requireCliDataWrite, resolveCliOperatorId } = await import(
        "../../lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales draft inquiry-response", permission: "escalate:plan" });
      runSalesDraftInquiryResponse({
        inquiryId: opts.inquiryId,
        to: opts.to,
        subject: opts.subject,
        body: opts.body,
        actor: resolveCliOperatorId() ?? "operator",
      });
    });

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
  finances
    .command("reconcile")
    .description("Payroll plan vs monthly books reconcile (read-only; --output writes report)")
    .option("--month <YYYY-MM>", "As-of month")
    .option("--output <filename>", "Write markdown report to agent-summaries/finance/")
    .option("--json", "JSON output")
    .action((opts: { month?: string; output?: string; json?: boolean }) =>
      runFinancesReconcile({ month: opts.month, output: opts.output, json: opts.json })
    );
  finances.command("list").description("List all monthly finance entries").action(runFinancesList);
  finances.command("show <month>").description("Show monthly finance details").action(runFinancesShow);
  finances
    .command("briefing")
    .description("Executive finance briefing (cash, burn, tax estimate, YTD)")
    .option("--month <YYYY-MM>", "as_of month (default: current)")
    .action((opts: { month?: string }) => runFinancesBriefing({ month: opts.month }));
  finances
    .command("cash-balance")
    .description("Show confirmed cash balance (L1 · bank_account_id only)")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runFinancesCashBalance({ json: Boolean(opts.json) }));
  finances
    .command("capital-raise-crosscheck")
    .description("Compare finance capital-raise-cases.yaml cap_table to IR cap-table.yaml")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) =>
      runFinancesCapitalRaiseCrossCheck({ json: Boolean(opts.json) }),
    );
  finances
    .command("variance")
    .description("FY plan vs monthly YAML revenue variance")
    .option("-o, --output <filename>", "Save to docs/plans/variance/")
    .action((opts) => runFinancesVariance({ output: opts.output }));
  finances
    .command("close")
    .description("Monthly or annual close (journal + reconcile report)")
    .option("--month <YYYY-MM>", "Close month")
    .option("--fiscal-year <fy>", "Annual close fiscal year label")
    .option("--no-depreciation", "Skip depreciation journals")
    .option("--no-payroll", "Skip payroll journals")
    .option("-o, --output <filename>", "Write report markdown")
    .option("--operator-id <id>", "Operator id")
    .action((opts: {
      month?: string;
      fiscalYear?: string;
      depreciation?: boolean;
      payroll?: boolean;
      output?: string;
      operatorId?: string;
    }) =>
      runFinancesClose({
        month: opts.month,
        fiscalYear: opts.fiscalYear,
        operatorId: opts.operatorId,
        postDepreciation: opts.depreciation !== false,
        postPayroll: opts.payroll !== false,
        output: opts.output,
      }),
    );

  const tax = program.command("tax").description("Tax calendar and filing prep");
  tax
    .command("calendar")
    .description("Expand tax / social / lodging obligation calendar")
    .option("--today <YYYY-MM-DD>", "Anchor date (default: today)")
    .option("--json", "Print JSON")
    .action((opts: { today?: string; json?: boolean }) =>
      runTaxCalendar({ today: opts.today, json: Boolean(opts.json) }),
    );
  tax
    .command("calendar-view")
    .description("Canvas view model for tax calendar board")
    .option("--today <YYYY-MM-DD>", "Anchor date")
    .option("--company <name>", "Company display name")
    .option("--json", "Print JSON")
    .action((opts: { today?: string; company?: string; json?: boolean }) =>
      runTaxCalendarView({
        today: opts.today,
        companyName: opts.company,
        json: Boolean(opts.json),
      }),
    );
  tax
    .command("gaps")
    .description("List open tax filing gaps overlay")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runTaxGaps({ json: Boolean(opts.json) }));
  tax
    .command("consumption-check")
    .description("Verify consumption tax classification consistency")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) =>
      runTaxConsumptionCheck({ json: Boolean(opts.json) }),
    );
  tax
    .command("depreciation")
    .description("Verify fixed asset depreciation against straight-line model")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) =>
      runTaxDepreciation({ json: Boolean(opts.json) }),
    );

  tax
    .command("consumption")
    .description("Consumption tax summary for period")
    .requiredOption("--period <YYYY-MM>", "Tax period")
    .option("--method <method>", "standard or simplified")
    .option("--deemed-rate <pct>", "Simplified deemed purchase rate", (v) => Number(v))
    .option("--transitional-rate <pct>", "80, 50, or 100", (v) => Number(v))
    .option("--json", "Print JSON")
    .action((opts: {
      period: string;
      method?: "standard" | "simplified";
      deemedRate?: number;
      transitionalRate?: 80 | 50 | 100;
      json?: boolean;
    }) => runTaxConsumptionCalc(opts));
  tax
    .command("consumption-eligibility")
    .description("Consumption tax refund claim-kind gates (does not file)")
    .requiredOption("--period <YYYY-MM>", "Tax period")
    .option("--method <method>", "standard or simplified")
    .option("--deemed-rate <pct>", "Simplified deemed purchase rate", (v) => Number(v))
    .option("--json", "Print JSON")
    .action((opts: {
      period: string;
      method?: "standard" | "simplified";
      deemedRate?: number;
      json?: boolean;
    }) => runTaxConsumptionEligibility(opts));

  tax
    .command("invoice-registration")
    .description("Verify invoice registration number and flags")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) =>
      runTaxInvoiceRegistrationCheck({ json: Boolean(opts.json) }),
    );
  tax
    .command("invoice-issue-check")
    .description("Qualified invoice issuance prerequisites")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) =>
      runTaxQualifiedInvoiceCheck({ json: Boolean(opts.json) }),
    );
  tax
    .command("readiness")
    .description("Tax module practical readiness score (distinct from agent-readiness)")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runTaxReadiness({ json: Boolean(opts.json) }));

  tax
    .command("handoff")
    .description("Create tax advisor correspondence draft (CEO approval required to send)")
    .option("--fy <FY>", "Fiscal year e.g. FY2026")
    .option("--json", "Print JSON")
    .action(async (opts: { fy?: string; json?: boolean }) => {
      const { requireCliDataWrite } = await import("../../lib/console-auth/cli-operator.js");
      requireCliDataWrite({ command: "tax handoff", permission: "escalate:plan" });
      runTaxHandoff({ json: Boolean(opts.json), fiscalYear: opts.fy });
    });
  tax
    .command("package")
    .description("Build Ledger→tax advisor ZIP (XML draft + TB — not e-Tax submit)")
    .option("--fiscal-year <fy>", "Fiscal year")
    .option("--json", "Print JSON")
    .action(async (opts: { fiscalYear?: string; json?: boolean }) => {
      const { runTaxModuleHandoffPackage } = await import("../../commands/ledger-product.js");
      runTaxModuleHandoffPackage(opts);
    });

  const taxGap = tax.command("gap").description("Tax filing gap overlay admin");
  taxGap
    .command("resolve")
    .description("Update gap status after tax advisor / accounting confirmation")
    .requiredOption("--id <gapId>", "Gap id from tax-filing-gaps.yaml")
    .requiredOption("--status <status>", "open | resolved | deferred")
    .option("--notes <text>", "Append notes")
    .option("--json", "Print JSON")
    .action(async (opts: { id: string; status: string; notes?: string; json?: boolean }) => {
      const { requireCliDataWrite } = await import("../../lib/console-auth/cli-operator.js");
      requireCliDataWrite({ command: "tax gap resolve", permission: "escalate:plan" });
      const status = opts.status as "open" | "resolved" | "deferred";
      if (!["open", "resolved", "deferred"].includes(status)) {
        throw new Error("status must be open, resolved, or deferred");
      }
      runTaxGapResolveCommand({
        id: opts.id,
        status,
        notes: opts.notes,
        json: Boolean(opts.json),
      });
    });

  const expenseClaim = program
    .command("expense-claim")
    .description("Expense claim workflow (REG-005 · ADR-0032)");
  expenseClaim
    .command("list")
    .description("List expense claims")
    .option("--status <status>", "Filter by status")
    .option("--json", "Print JSON")
    .action((opts: { status?: string; json?: boolean }) =>
      runExpenseClaimList(opts),
    );
  expenseClaim
    .command("show <claimId>")
    .description("Show expense claim")
    .option("--json", "Print JSON")
    .action((claimId: string, opts: { json?: boolean }) =>
      runExpenseClaimShow({ claimId, json: Boolean(opts.json) }),
    );
  expenseClaim
    .command("revision")
    .description("Print expense-claims.yaml revision")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) =>
      runExpenseClaimRevision({ json: Boolean(opts.json) }),
    );
  expenseClaim
    .command("gate <claimId>")
    .description("Evaluate approval gate for a claim")
    .option("--json", "Print JSON")
    .action((claimId: string, opts: { json?: boolean }) =>
      runExpenseClaimGate({ claimId, json: Boolean(opts.json) }),
    );
  expenseClaim
    .command("ingest")
    .description("Ingest QR receipt and propose expense claim")
    .option("--qr <payload>", "QR payload or JSON")
    .option("--file <path>", "Read QR/JSON from file")
    .requiredOption("--person-id <id>", "person_id")
    .requiredOption("--org-unit-id <id>", "org_unit_id")
    .requiredOption("--account-code <code>", "4-digit account code")
    .option("--operator-id <id>", "Operator id")
    .option("--expected-revision <rev>", "expected_claims_revision")
    .option("--json", "Print JSON")
    .action(async (opts: {
      qr?: string;
      file?: string;
      personId: string;
      orgUnitId: string;
      accountCode: string;
      operatorId?: string;
      expectedRevision?: string;
      json?: boolean;
    }) => {
      await runExpenseClaimIngest({
        qr: opts.qr,
        file: opts.file,
        personId: opts.personId,
        orgUnitId: opts.orgUnitId,
        accountCode: opts.accountCode,
        operatorId: opts.operatorId,
        expectedRevision: opts.expectedRevision,
        json: Boolean(opts.json),
      });
    });
  expenseClaim
    .command("approve <claimId>")
    .description("Approve expense claim (human gate)")
    .option("--operator-id <id>", "Approver operator id")
    .option("--co-approver-id <id>", "Co-approver for ringi gate")
    .option("--board-event-id <id>", "Board event for tier C")
    .option("--expected-revision <rev>", "expected_claim_revision")
    .option("--json", "Print JSON")
    .action((claimId: string, opts: {
      operatorId?: string;
      coApproverId?: string;
      boardEventId?: string;
      expectedRevision?: string;
      json?: boolean;
    }) =>
      runExpenseClaimApprove({
        claimId,
        operatorId: opts.operatorId,
        coApproverId: opts.coApproverId,
        boardEventId: opts.boardEventId,
        expectedRevision: opts.expectedRevision,
        json: Boolean(opts.json),
      }),
    );
  expenseClaim
    .command("reject <claimId>")
    .description("Reject expense claim (human gate)")
    .option("--operator-id <id>", "Rejector operator id")
    .option("--reason <text>", "Rejection reason")
    .option("--expected-revision <rev>", "expected_claim_revision")
    .option("--json", "Print JSON")
    .action((claimId: string, opts: {
      operatorId?: string;
      reason?: string;
      expectedRevision?: string;
      json?: boolean;
    }) =>
      runExpenseClaimReject({
        claimId,
        operatorId: opts.operatorId,
        reason: opts.reason,
        expectedRevision: opts.expectedRevision,
        json: Boolean(opts.json),
      }),
    );
  expenseClaim
    .command("prepare-transfer <claimId>")
    .description("Prepare broker transfer for reimbursement")
    .requiredOption("--source-bank-account-id <id>", "bank_account_id")
    .requiredOption("--stakeholder-id <id>", "stakeholder_id")
    .requiredOption("--payee <name>", "Payee display name")
    .option("--operator-id <id>", "Operator id")
    .option("--expected-revision <rev>", "expected_claim_revision")
    .option("--json", "Print JSON")
    .action((claimId: string, opts: {
      sourceBankAccountId: string;
      stakeholderId: string;
      payee: string;
      operatorId?: string;
      expectedRevision?: string;
      json?: boolean;
    }) =>
      runExpenseClaimPrepareTransfer({
        claimId,
        sourceBankAccountId: opts.sourceBankAccountId,
        stakeholderId: opts.stakeholderId,
        payee: opts.payee,
        operatorId: opts.operatorId,
        expectedRevision: opts.expectedRevision,
        json: Boolean(opts.json),
      }),
    );
  expenseClaim
    .command("reimburse <claimId>")
    .description("Mark expense claim reimbursed")
    .requiredOption("--payment-ref <ref>", "Payment reference")
    .option("--bank-statement-ref <ref>", "Bank statement ref")
    .option("--operator-id <id>", "Operator id")
    .option("--expected-revision <rev>", "expected_claim_revision")
    .option("--json", "Print JSON")
    .action((claimId: string, opts: {
      paymentRef: string;
      bankStatementRef?: string;
      operatorId?: string;
      expectedRevision?: string;
      json?: boolean;
    }) =>
      runExpenseClaimReimburse({
        claimId,
        paymentRef: opts.paymentRef,
        bankStatementRef: opts.bankStatementRef,
        operatorId: opts.operatorId,
        expectedRevision: opts.expectedRevision,
        json: Boolean(opts.json),
      }),
    );

  const budget = program.command("budget").description("Budget envelope delegation");
  budget
    .command("show")
    .description("Show budget delegation summary")
    .option("--fiscal-year <fy>", "Fiscal year label")
    .option("--json", "Print JSON")
    .action((opts: { fiscalYear?: string; json?: boolean }) =>
      runBudgetShow({ fiscalYear: opts.fiscalYear, json: Boolean(opts.json) }),
    );
  budget
    .command("allocate-department")
    .description("Allocate department category budget")
    .requiredOption("--org-unit-id <id>", "Department org_unit_id")
    .requiredOption("--account-code <code>", "Expense account code")
    .requiredOption("--amount-yen <n>", "Amount in JPY", (v) => Number(v))
    .option("--operator-id <id>", "Operator id")
    .option("--expected-revision <rev>", "budget revision")
    .option("--json", "Print JSON")
    .action((opts: {
      orgUnitId: string;
      accountCode: string;
      amountYen: number;
      operatorId?: string;
      expectedRevision?: string;
      json?: boolean;
    }) => runBudgetAllocateDepartment(opts));
  budget
    .command("allocate-member")
    .description("Allocate member budget envelope")
    .requiredOption("--org-unit-id <id>", "Department org_unit_id")
    .requiredOption("--member-operator-id <id>", "Member operator id")
    .requiredOption("--amount-yen <n>", "Amount in JPY", (v) => Number(v))
    .option("--operator-id <id>", "Actor operator id")
    .option("--expected-revision <rev>", "budget revision")
    .option("--json", "Print JSON")
    .action((opts: {
      orgUnitId: string;
      memberOperatorId: string;
      amountYen: number;
      operatorId?: string;
      expectedRevision?: string;
      json?: boolean;
    }) => runBudgetAllocateMember(opts));
  budget
    .command("set-company")
    .description("Set company category budget (CEO/approver)")
    .requiredOption("--account-code <code>", "Expense account code")
    .requiredOption("--amount-yen <n>", "Amount in JPY", (v) => Number(v))
    .option("--operator-id <id>", "Operator id")
    .option("--expected-revision <rev>", "budget revision")
    .option("--json", "Print JSON")
    .action((opts: {
      accountCode: string;
      amountYen: number;
      operatorId?: string;
      expectedRevision?: string;
      json?: boolean;
    }) => runBudgetSetCompanyCategory(opts));
  budget
    .command("rollover")
    .description("Rollover budget to next fiscal year (CEO/approver)")
    .requiredOption("--to-fiscal-year <fy>", "Target fiscal year")
    .option("--from-fiscal-year <fy>", "Source fiscal year")
    .option("--operator-id <id>", "Operator id")
    .option("--json", "Print JSON")
    .action((opts: {
      toFiscalYear: string;
      fromFiscalYear?: string;
      operatorId?: string;
      json?: boolean;
    }) => runBudgetRollover(opts));

  const ledger = program.command("ledger").description("General ledger and trial balance");
  const ledgerJournal = ledger.command("journal").description("Journal commands");
  ledgerJournal
    .command("list")
    .description("List journal entries")
    .option("--from <date>", "From date YYYY-MM-DD")
    .option("--to <date>", "To date YYYY-MM-DD")
    .option("--account <code>", "Filter by account code")
    .option("--source <kind>", "Filter by source kind")
    .option("--json", "Print JSON")
    .action((opts: {
      from?: string;
      to?: string;
      account?: string;
      source?: string;
      json?: boolean;
    }) => runLedgerJournalList(opts));
  ledgerJournal
    .command("backfill-tax")
    .description("Backfill tax_category on journal lines from CoA defaults")
    .option("--dry-run", "Preview without writing")
    .option("--json", "Print JSON")
    .action((opts: { dryRun?: boolean; json?: boolean }) =>
      runLedgerJournalBackfillTax({
        dryRun: Boolean(opts.dryRun),
        json: Boolean(opts.json),
      }),
    );
  ledgerJournal
    .command("backfill-audit")
    .description("Backfill posted_at/posted_by audit trail on legacy journal entries")
    .option("--dry-run", "Preview without writing")
    .option("--json", "Print JSON")
    .action((opts: { dryRun?: boolean; json?: boolean }) =>
      runLedgerJournalBackfillAudit({
        dryRun: Boolean(opts.dryRun),
        json: Boolean(opts.json),
      }),
    );
  ledger
    .command("post")
    .description("Post journal entry from YAML file or automated source")
    .option("--file <path>", "Journal entry YAML")
    .option("--source <kind>", "Automated source (depreciation | monthly-pl | remittance | ar-receipt | ap-payment | payroll-payment)")
    .option("--month <YYYY-MM>", "Period for automated source")
    .option("--obligation <kind>", "Remittance: withholding | social_insurance | consumption_tax")
    .option("--from-calendar <row-id>", "Remittance: derive obligation/period from tax calendar row")
    .option("--counterparty <id>", "AR/AP counterparty or property id")
    .option("--amount <yen>", "AR receipt / AP payment / payroll-payment amount")
    .option("--operator-id <id>", "Operator id")
    .action((opts: {
      file?: string;
      source?: string;
      month?: string;
      obligation?: string;
      fromCalendar?: string;
      counterparty?: string;
      amount?: string;
      operatorId?: string;
    }) => runLedgerPost(opts));
  ledger
    .command("gl")
    .description("General ledger for account")
    .requiredOption("--account <code>", "Account code")
    .option("--from <date>", "From date")
    .option("--to <date>", "To date")
    .option("--json", "Print JSON")
    .action((opts: {
      account: string;
      from?: string;
      to?: string;
      json?: boolean;
    }) => runLedgerGl(opts));
  ledger
    .command("trial-balance")
    .description("Trial balance as of date")
    .option("--as-of <date>", "As-of date YYYY-MM-DD")
    .option("--json", "Print JSON")
    .action((opts: { asOf?: string; json?: boolean }) =>
      runLedgerTrialBalance(opts),
    );
  const ledgerOpening = ledger
    .command("opening-balance")
    .description("Opening balance commands");
  ledgerOpening
    .command("generate")
    .description("Generate opening balances from trial balance")
    .requiredOption("--fiscal-year <fy>", "Fiscal year label e.g. FY2027")
    .option("--as-of <date>", "As-of date YYYY-MM-DD")
    .option("--period-start <YYYY-MM>", "Period start month")
    .option("--dry-run", "Preview without writing")
    .option("--json", "Print JSON")
    .action((opts: {
      fiscalYear: string;
      asOf?: string;
      periodStart?: string;
      dryRun?: boolean;
      json?: boolean;
    }) => runLedgerOpeningBalanceGenerate(opts));
  ledger
    .command("monthly-reconcile")
    .description("Reconcile monthly P/L vs trial balance")
    .requiredOption("--month <YYYY-MM>", "Month")
    .option("--json", "Print JSON")
    .action((opts: { month: string; json?: boolean }) =>
      runLedgerMonthlyReconcile(opts),
    );
  ledger
    .command("export")
    .description("Export journal or trial balance to CSV (human-readable mirror)")
    .option(
      "--template <kind>",
      "journal-csv (default) | trial-balance-csv | account-breakdown-csv",
      "journal-csv",
    )
    .option("--from <date>", "From date YYYY-MM-DD (journal-csv)")
    .option("--to <date>", "To date YYYY-MM-DD (journal-csv)")
    .option("--as-of <date>", "As-of date YYYY-MM-DD (trial-balance-csv)")
    .option("--account <code>", "Filter by account code (journal-csv)")
    .option("--source <kind>", "Filter by source kind (journal-csv)")
    .option("-o, --output <path>", "Output CSV path")
    .option("--dry-run", "Print CSV to stdout without writing")
    .option("--json", "Print JSON")
    .action((opts: {
      template?: string;
      from?: string;
      to?: string;
      asOf?: string;
      account?: string;
      source?: string;
      output?: string;
      dryRun?: boolean;
      json?: boolean;
    }) => {
      const template =
        opts.template === "trial-balance-csv"
          ? "trial-balance-csv"
          : opts.template === "account-breakdown-csv"
            ? "account-breakdown-csv"
            : "journal-csv";
      runLedgerExport({
        template,
        from: opts.from,
        to: opts.to,
        asOf: opts.asOf,
        account: opts.account,
        source: opts.source,
        output: opts.output,
        dryRun: Boolean(opts.dryRun),
        json: Boolean(opts.json),
      });
    });

  ledger
    .command("balance-sheet")
    .description("Balance sheet from trial balance")
    .option("--as-of <date>", "As-of date YYYY-MM-DD")
    .option("--fiscal-year <fy>", "Fiscal year for net income")
    .option("--json", "Print JSON")
    .action((opts: { asOf?: string; fiscalYear?: string; json?: boolean }) =>
      runLedgerBalanceSheet(opts),
    );

  ledger
    .command("subsidiary")
    .description("Subsidiary ledger for control account")
    .requiredOption("--account <code>", "Account code e.g. 1150")
    .option("--as-of <date>", "As-of date YYYY-MM-DD")
    .option("--json", "Print JSON")
    .action((opts: { account: string; asOf?: string; json?: boolean }) =>
      runLedgerSubsidiary(opts),
    );

  ledger
    .command("reverse")
    .description("Post reversing entry for an existing journal")
    .requiredOption("--entry-id <id>", "Original entry id")
    .option("--occurred-at <iso>", "Reversal occurred_at")
    .action((opts: { entryId: string; occurredAt?: string }) =>
      runLedgerReverse(opts),
    );

  const ledgerPeriod = ledger.command("period").description("Period lock commands");
  ledgerPeriod
    .command("lock")
    .description("Lock an accounting period")
    .requiredOption("--month <YYYY-MM>", "Month")
    .option("--reason <text>", "Lock reason")
    .action((opts: { month: string; reason?: string }) =>
      runLedgerPeriodLock(opts),
    );
  ledgerPeriod
    .command("unlock")
    .description("Unlock an accounting period (approver)")
    .requiredOption("--month <YYYY-MM>", "Month")
    .requiredOption("--reason <text>", "Unlock reason (audit trail)")
    .action((opts: { month: string; reason: string }) =>
      runLedgerPeriodUnlock(opts),
    );

  const ledgerDencho = ledger
    .command("dencho")
    .description("電子帳簿保存法 — 検索・コンプライアンス");
  ledgerDencho
    .command("search")
    .description("Search journal lines (date · amount · counterparty)")
    .option("--from <date>", "From YYYY-MM-DD")
    .option("--to <date>", "To YYYY-MM-DD")
    .option("--min-amount <yen>", "Minimum line amount")
    .option("--max-amount <yen>", "Maximum line amount")
    .option("--counterparty <id>", "Counterparty id")
    .option("--account <code>", "Account code")
    .option("--description <text>", "Description contains")
    .option("--entry-id <id>", "Entry id")
    .option("--limit <n>", "Max hits", "200")
    .option("--json", "Print JSON")
    .action((opts: {
      from?: string;
      to?: string;
      minAmount?: string;
      maxAmount?: string;
      counterparty?: string;
      account?: string;
      description?: string;
      entryId?: string;
      limit?: string;
      json?: boolean;
    }) => runLedgerDenchoSearch(opts));
  ledgerDencho
    .command("check")
    .description("Electronic ledger compliance report")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runLedgerDenchoCheck(opts));

  const ledgerProduct = ledger
    .command("product")
    .description("OrgOS Ledger product — signup · provision · fleet");
  ledgerProduct
    .command("plans")
    .description("List sellable plans")
    .action(async () => {
      const { runLedgerProductPlans } = await import("../../commands/ledger-product.js");
      runLedgerProductPlans();
    });
  ledgerProduct
    .command("signup")
    .description("Create signup + Stripe checkout URL (stub without STRIPE_SECRET_KEY)")
    .requiredOption("--company <name>", "Company legal name")
    .requiredOption("--email <email>", "Admin email")
    .option("--plan <id>", "starter | business | accountant", "starter")
    .option("--tenant-id <id>", "Tenant id override")
    .action(async (opts: {
      company: string;
      email: string;
      plan?: string;
      tenantId?: string;
    }) => {
      const { runLedgerProductSignup } = await import("../../commands/ledger-product.js");
      await runLedgerProductSignup({
        companyName: opts.company,
        adminEmail: opts.email,
        plan: opts.plan,
        tenantId: opts.tenantId,
      });
    });
  ledgerProduct
    .command("provision")
    .description("Provision ledger tenant workspace (ops)")
    .requiredOption("--tenant-id <id>", "Tenant id")
    .requiredOption("--company <name>", "Company name")
    .requiredOption("--email <email>", "CEO email")
    .option("--plan <id>", "Plan id", "starter")
    .action(async (opts: {
      tenantId: string;
      company: string;
      email: string;
      plan?: string;
    }) => {
      const { runLedgerProductProvision } = await import("../../commands/ledger-product.js");
      runLedgerProductProvision({
        tenantId: opts.tenantId,
        companyName: opts.company,
        adminEmail: opts.email,
        plan: opts.plan,
      });
    });
  ledgerProduct
    .command("activate-signup")
    .description("Provision tenant after paid signup")
    .requiredOption("--signup-id <id>", "Signup id")
    .action(async (opts: { signupId: string }) => {
      const { runLedgerProductActivateSignup } = await import("../../commands/ledger-product.js");
      runLedgerProductActivateSignup({ signupId: opts.signupId });
    });
  ledgerProduct
    .command("fleet-status")
    .description("Fleet signups and tenant subscription status")
    .option("--product-only", "Only orgos-ledger tenants")
    .action(async (opts: { productOnly?: boolean }) => {
      const { runLedgerProductFleetStatus } = await import("../../commands/ledger-product.js");
      runLedgerProductFleetStatus({ productOnly: opts.productOnly });
    });
  ledgerProduct
    .command("fleet-health")
    .description("Validate health of all ledger product tenants")
    .option("--json", "Print JSON")
    .action(async (opts: { json?: boolean }) => {
      const { runLedgerProductFleetHealth } = await import("../../commands/ledger-product.js");
      runLedgerProductFleetHealth(opts);
    });
  ledgerProduct
    .command("readiness")
    .description("Product / commercial / accounting / customer-ux readiness scores")
    .option("--json", "Print JSON")
    .option("--commercial", "Ops commercial gate (billing · restore · monitor)")
    .option("--accounting", "Accounting commercial gate (books · bank · close · tax handoff)")
    .option("--customer-ux", "Customer UX gate (beginner · WebUI · AIA)")
    .action(async (opts: {
      json?: boolean;
      commercial?: boolean;
      accounting?: boolean;
      customerUx?: boolean;
    }) => {
      const { runLedgerProductReadiness } = await import("../../commands/ledger-product.js");
      runLedgerProductReadiness(opts);
    });
  ledgerProduct
    .command("export")
    .description("Export tenant data archive (portability)")
    .option("--tenant-id <id>", "Tenant id (default ORGOS_TENANT)")
    .option("--output <path>", "Output .tar.gz path")
    .action(async (opts: { tenantId?: string; output?: string }) => {
      const { runLedgerProductExport } = await import("../../commands/ledger-product.js");
      runLedgerProductExport(opts);
    });
  ledgerProduct
    .command("subscription")
    .description("Show current tenant subscription")
    .action(async () => {
      const { runLedgerProductSubscription } = await import("../../commands/ledger-product.js");
      runLedgerProductSubscription();
    });
  ledgerProduct
    .command("control-plane")
    .description("Control plane tenant registry (P3)")
    .option("--sync", "Sync from product tenants")
    .action(async (opts: { sync?: boolean }) => {
      const { runLedgerProductControlPlane } = await import("../../commands/ledger-product.js");
      runLedgerProductControlPlane(opts);
    });
  ledgerProduct
    .command("onboarding")
    .description("Onboarding checklist for current tenant")
    .action(async () => {
      const { runLedgerProductOnboarding } = await import("../../commands/ledger-product.js");
      runLedgerProductOnboarding();
    });
  ledgerProduct
    .command("ops-dashboard")
    .description("Fleet ops dashboard JSON (ORGOS_LEDGER_OPS=1 or CEO)")
    .action(async () => {
      const { runLedgerProductOpsDashboard } = await import("../../commands/ledger-product.js");
      runLedgerProductOpsDashboard();
    });
  ledgerProduct
    .command("tax-readiness")
    .description("Statutory / e-Tax module readiness (P4)")
    .action(async () => {
      const { runLedgerProductTaxReadiness } = await import("../../commands/ledger-product.js");
      runLedgerProductTaxReadiness();
    });
  ledgerProduct
    .command("link-accountant")
    .description("Link client tenant to accountant hub")
    .requiredOption("--client <id>", "Client tenant id")
    .requiredOption("--accountant <id>", "Accountant tenant id")
    .action(async (opts: { client: string; accountant: string }) => {
      const { runLedgerProductLinkAccountant } = await import("../../commands/ledger-product.js");
      runLedgerProductLinkAccountant({
        clientTenantId: opts.client,
        accountantTenantId: opts.accountant,
      });
    });
  ledgerProduct
    .command("stripe-status")
    .description("Stripe billing ops / key status (secrets never printed)")
    .option("--json", "Print JSON")
    .action(async (opts: { json?: boolean }) => {
      const { runLedgerProductStripeStatus } = await import("../../commands/ledger-product.js");
      runLedgerProductStripeStatus(opts);
    });
  ledgerProduct
    .command("stripe-attest")
    .description(
      "Attest Stripe keys from env into product-fleet/stripe-ops.yaml (no secrets written)",
    )
    .option("--note <text>", "Optional note")
    .action(async (opts: { note?: string }) => {
      const { runLedgerProductStripeAttest } = await import("../../commands/ledger-product.js");
      runLedgerProductStripeAttest(opts);
    });
  ledgerProduct
    .command("legal-attest")
    .description(
      "Record counsel-signed ToS/DPA attestation (after publishing terms-of-service.md)",
    )
    .requiredOption("--signed-by <name>", "Signer (e.g. counsel or CEO)")
    .option("--document <path>", "Signed document path", "docs/product/legal/terms-of-service.md")
    .option("--note <text>", "Optional note")
    .option("--counsel-reviewed-by <name>", "External counsel identity for commercial claim")
    .action(async (opts: {
      signedBy: string;
      document?: string;
      note?: string;
      counselReviewedBy?: string;
    }) => {
      const { runLedgerProductLegalAttest } = await import("../../commands/ledger-product.js");
      runLedgerProductLegalAttest(opts);
    });
  ledgerProduct
    .command("mail-drill")
    .description("Send a real SMTP drill mail (requires ORGOS_MAIL_SMTP_URL)")
    .requiredOption("--to <email>", "Recipient address")
    .option("--json", "Print JSON")
    .action(async (opts: { to: string; json?: boolean }) => {
      const { runLedgerProductMailDrill } = await import("../../commands/ledger-product.js");
      await runLedgerProductMailDrill(opts);
    });
  ledgerProduct
    .command("billing-issues")
    .description("List fleet billing issues (past_due, cancelled, unhealthy)")
    .option("--json", "Print JSON")
    .action(async (opts: { json?: boolean }) => {
      const { runLedgerProductBillingIssues } = await import("../../commands/ledger-product.js");
      runLedgerProductBillingIssues(opts);
    });
  ledgerProduct
    .command("restore")
    .description("Restore tenant from export archive")
    .requiredOption("--tenant-id <id>", "Tenant id")
    .requiredOption("--archive <path>", "Path to .tar.gz export")
    .option("--force", "Overwrite existing tenant directory")
    .action(async (opts: { tenantId: string; archive: string; force?: boolean }) => {
      const { runLedgerProductRestore } = await import("../../commands/ledger-product.js");
      await runLedgerProductRestore(opts);
    });
  ledgerProduct
    .command("offboard")
    .description("Offboard tenant (export, cancel subscription, optional purge)")
    .requiredOption("--tenant-id <id>", "Tenant id")
    .option("--no-export-first", "Skip export before offboard")
    .option("--output <path>", "Export path")
    .option("--purge", "Schedule tenant data purge after grace period")
    .option("--purge-now", "Purge tenant data immediately (requires --purge)")
    .option("--grace-days <days>", "Grace days before purge (default 30)", "30")
    .action(async (opts: {
      tenantId: string;
      noExportFirst?: boolean;
      output?: string;
      purge?: boolean;
      purgeNow?: boolean;
      graceDays?: string;
    }) => {
      const { runLedgerProductOffboard } = await import("../../commands/ledger-product.js");
      runLedgerProductOffboard({
        tenantId: opts.tenantId,
        exportFirst: !opts.noExportFirst,
        output: opts.output,
        purge: opts.purge,
        purgeNow: opts.purgeNow,
        graceDays: Number.parseInt(opts.graceDays ?? "30", 10),
      });
    });
  ledgerProduct
    .command("purge-due")
    .description("Purge cancelled tenants whose grace period has elapsed")
    .action(async () => {
      const { runLedgerProductPurgeDue } = await import("../../commands/ledger-product.js");
      runLedgerProductPurgeDue();
    });
  ledgerProduct
    .command("restore-drill")
    .description("Run restore drill and record result")
    .requiredOption("--tenant-id <id>", "Source tenant id")
    .requiredOption("--archive <path>", "Archive to restore")
    .action(async (opts: { tenantId: string; archive: string }) => {
      const { runLedgerProductRestoreDrill } = await import("../../commands/ledger-product.js");
      runLedgerProductRestoreDrill(opts);
    });
  ledgerProduct
    .command("monitor")
    .description("Fleet health monitor (optional alert webhook)")
    .option("--json", "Print JSON")
    .option("--fail-on-unhealthy", "Exit non-zero when unhealthy")
    .action(async (opts: { json?: boolean; failOnUnhealthy?: boolean }) => {
      const { runLedgerProductMonitor } = await import("../../commands/ledger-product.js");
      await runLedgerProductMonitor(opts);
    });
  ledgerProduct
    .command("mail-outbox")
    .description("List customer mail outbox (dev / audit)")
    .option("--json", "Print JSON")
    .action(async (opts: { json?: boolean }) => {
      const { runLedgerProductMailOutbox } = await import("../../commands/ledger-product.js");
      runLedgerProductMailOutbox(opts);
    });
  ledgerProduct
    .command("seed-demo-year")
    .description("Seed full fiscal-year demo journals (opt-in; empty by default on provision)")
    .option("--fiscal-year <fy>", "Fiscal year label", "FY2026")
    .option("--force", "Seed even if journals exist")
    .option("--json", "Print JSON")
    .action(async (opts: { fiscalYear?: string; force?: boolean; json?: boolean }) => {
      const { runLedgerProductSeedDemoYear } = await import("../../commands/ledger-product.js");
      runLedgerProductSeedDemoYear(opts);
    });

  const receipt = program
    .command("receipt")
    .description("QR-signed JP receipt (適格請求書) issue · claim · verify");
  receipt
    .command("init")
    .description("Create data/receipt-qr/config.yaml")
    .requiredOption(
      "--claim-base-url <url>",
      "Claim endpoint prefix (e.g. https://host/wire/v1/receipts/claim)",
    )
    .option("--portal-url <url>", "Verify portal URL", "https://receipt.oorgos.org/r")
    .option("--simple-eligible", "Allow qualified_simplified_invoice")
    .option("--simple-basis <text>", "Business basis for simplified invoice")
    .option("--force", "Overwrite existing config")
    .option("--tenant <id>", "Tenant id")
    .action((opts) =>
      runReceiptInit({
        tenant: opts.tenant,
        claimBaseUrl: opts.claimBaseUrl,
        portalUrl: opts.portalUrl,
        simpleEligible: Boolean(opts.simpleEligible),
        simpleBasis: opts.simpleBasis,
        force: Boolean(opts.force),
      }),
    );
  receipt
    .command("issue")
    .description("Issue a signed QR receipt from YAML/JSON")
    .requiredOption("--file <path>", "Issue input file")
    .option("--pdf <path>", "Write PDF to path")
    .option("--json", "Print JSON")
    .option("--tenant <id>", "Tenant id")
    .action((opts) =>
      void runReceiptIssue({
        tenant: opts.tenant,
        file: opts.file,
        pdf: opts.pdf,
        json: Boolean(opts.json),
      }),
    );
  receipt
    .command("list")
    .description("List issued receipts")
    .option("--status <status>", "Filter claim_status")
    .option("--json", "Print JSON")
    .option("--tenant <id>", "Tenant id")
    .action((opts) =>
      runReceiptList({
        tenant: opts.tenant,
        status: opts.status,
        json: Boolean(opts.json),
      }),
    );
  receipt
    .command("show")
    .description("Show receipt details")
    .argument("<id>", "RCPT-YYYYMMDD-NNN")
    .option("--json", "Print JSON")
    .option("--tenant <id>", "Tenant id")
    .action((id: string, opts) =>
      runReceiptShow({ tenant: opts.tenant, id, json: Boolean(opts.json) }),
    );
  receipt
    .command("pdf")
    .description("Regenerate PDF for an issued receipt")
    .argument("<id>", "RCPT-YYYYMMDD-NNN")
    .requiredOption("--out <path>", "Output PDF path")
    .option("--tenant <id>", "Tenant id")
    .action((id: string, opts) =>
      void runReceiptPdf({ tenant: opts.tenant, id, out: opts.out }),
    );
  receipt
    .command("verify")
    .description("Verify a receipt link, JSON file, or raw JSON")
    .argument("<input>", "Link, file path, or JSON")
    .option("--json", "Print JSON")
    .option("--tenant <id>", "Tenant id")
    .action((input: string, opts) =>
      runReceiptVerify({
        tenant: opts.tenant,
        input,
        json: Boolean(opts.json),
      }),
    );
  receipt
    .command("config")
    .description("Show receipt-qr config")
    .option("--json", "Print JSON")
    .option("--tenant <id>", "Tenant id")
    .action((opts) =>
      runReceiptConfigShow({ tenant: opts.tenant, json: Boolean(opts.json) }),
    );

  program
    .command("cash-balance")
    .description("Show cash balance (alias of finances cash-balance)")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => runFinancesCashBalance({ json: Boolean(opts.json) }));

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
    .option("--basis <basis>", "Data basis: gl or yojitsu", "yojitsu")
    .option("--compare", "Compare GL vs yojitsu summary (requires --basis gl)")
    .option("--prior-year", "Add prior-year comparative columns to GL BS/PL")
    .action(
      (opts: {
        fy?: string;
        output?: string;
        basis?: string;
        compare?: boolean;
        priorYear?: boolean;
      }) =>
        runReportKessan({
          fy: opts.fy,
          output: opts.output,
          basis: opts.basis === "gl" ? "gl" : "yojitsu",
          compare: Boolean(opts.compare),
          priorYear: Boolean(opts.priorYear),
        }),
    );
  report
    .command("jigyo")
    .description("Generate 事業報告書 PDF")
    .option("--fy <fiscalYear>", "Fiscal year (e.g. FY2026)", "FY2026")
    .option("-o, --output <filename>", "Output filename or path")
    .option("--basis <basis>", "Data basis: gl or yojitsu", "yojitsu")
    .action((opts: { fy?: string; output?: string; basis?: string }) =>
      runReportJigyo({
        fy: opts.fy,
        output: opts.output,
        basis: opts.basis === "gl" ? "gl" : "yojitsu",
      }),
    );
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
  outbox.command("printed <id>").description("Mark outbox item as printed").action(runIoOutboxPrinted);

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
    .option("--strict-legacy", "Reject legacy attestations without key_id")
    .action((opts) =>
      runEventsChainVerify({ json: opts.json, strictLegacy: opts.strictLegacy }),
    );
  eventsChain
    .command("backfill")
    .description("Rebuild create links from registry (existing chain requires --force)")
    .option("--force", "Overwrite existing chain file (destructive; disabled unless rebuild env is set)")
    .option("--i-understand-rebuild", "Confirm destructive chain rebuild")
    .action((opts) =>
      runEventsChainBackfill({ force: opts.force, iUnderstandRebuild: opts.iUnderstandRebuild }),
    );
  eventsChain
    .command("repair")
    .description("Backup polluted chain and rebuild from registry (ceo; not backfill --force)")
    .option("--i-understand-repair", "Confirm chain repair with backup")
    .option("--json", "JSON output")
    .action((opts) =>
      runEventsChainRepair({
        iUnderstandRepair: opts.iUnderstandRepair,
        json: opts.json,
      }),
    );
  eventsChain
    .command("attest")
    .description("Verify hash chain then sign weekly batch attestation (Ed25519)")
    .option("--force", "Re-sign current ISO week even if attestation exists")
    .option("--json", "JSON output")
    .action((opts) => runEventsChainAttest({ force: opts.force, json: opts.json }));
  eventsChain.command("tail").description("Show chain tail link").action(() => runEventsChainTail());
  eventsChain
    .command("pin")
    .description("Pin chain tail digest as a witness fixity point (do not use backfill --force to recover)")
    .action(() => runEventsChainPin());
  eventsChain
    .command("rotate-key")
    .description("Rotate Ed25519 attestation signing key (ceo + events:write)")
    .option("--json", "JSON output")
    .action((opts) => runEventsChainRotateKey({ json: opts.json }));
  eventsChain
    .command("migrate")
    .description("Migrate registry v3 + signing-meta v2 (records_audit hardening)")
    .option("--dry-run", "Preview migration without writing")
    .option("--json", "JSON output")
    .action((opts) => runEventsChainMigrate({ dryRun: opts.dryRun, json: opts.json }));
  eventsChain
    .command("export")
    .description("Export standalone audit verification bundle")
    .requiredOption("--out <dir>", "Output directory")
    .option("--json", "JSON output")
    .action((opts) => runEventsChainExport({ out: opts.out, json: opts.json }));
  const eventsAudit = events.command("audit").description("Company events periodic audit");
  eventsAudit
    .command("monthly")
    .description("Monthly audit report + human notification (records_audit)")
    .option("--month <month>", "YYYY-MM (default: current month)")
    .option("--no-notify", "Skip webhook / OpenWebUI notification")
    .option("-o, --output <filename>", "Report filename under agent-summaries/records-audit/")
    .option("--json", "JSON output")
    .option("--strict-legacy", "Reject legacy attestations without key_id")
    .action(async (opts) =>
      runEventsAuditMonthly({
        month: opts.month,
        notify: !opts.noNotify,
        output: opts.output,
        json: opts.json,
        strictLegacy: opts.strictLegacy,
      })
    );
  events
    .command("adopt")
    .description("Adopt existing EVT-*.md into registry + chain (ceo; preserves id and occurred_at)")
    .requiredOption("--id <id>", "EVT-* id")
    .option("--dry-run", "Preview without writing")
    .option("--json", "JSON output")
    .action((opts) => runEventsAdopt({ id: opts.id, dryRun: opts.dryRun, json: opts.json }));
  events
    .command("orphans")
    .description("List or prune orphan EVT-*.md not in registry")
    .option("--prune", "Delete untracked orphan markdown (ceo + --i-understand-purge)")
    .option("--dry-run", "Preview prune without deleting")
    .option("--i-understand-purge", "Confirm destructive orphan prune")
    .option("--json", "JSON output")
    .action((opts) =>
      runEventsOrphans({
        json: opts.json,
        prune: opts.prune,
        dryRun: opts.dryRun,
        iUnderstandPurge: opts.iUnderstandPurge,
      }),
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
    .command("void <id>")
    .description("Void a company event (append-only compensation; never deletes)")
    .requiredOption("--reason <reason>", "Why this event is voided")
    .action((id, opts) => runEventsVoid({ id, reason: opts.reason }));
  events
    .command("void-request <id>")
    .description("Propose counterpart void acknowledgment wire for a sent event")
    .requiredOption("--operator <id>", "Requesting operator id")
    .option("--peer <id>", "Peer id")
    .option("--message <text>", "Optional message")
    .action((id, opts) =>
      runEventsVoidRequest({
        id,
        operator: opts.operator,
        peer: opts.peer,
        message: opts.message,
      }),
    );
  events
    .command("void-ack <id>")
    .description("Register inbound void acknowledgment then allow events void")
    .option("--wire-event <id>", "Inbound wire event id")
    .option("--peer <id>", "Peer id")
    .option("--auto", "Pick inbound ack automatically")
    .action((id, opts) =>
      runEventsVoidAck({
        id,
        wireEvent: opts.wireEvent,
        peer: opts.peer,
        auto: opts.auto,
      }),
    );
  events
    .command("wire-status <id>")
    .description("Show Wire delivery / void gate status for a company event")
    .option("--json", "JSON output")
    .action((id, opts) => runEventsWireStatus({ id, json: opts.json }));
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
    .action((id, opts) =>
      runEventsRegisterArtifact({ id, files: opts.files, kind: opts.kind })
    );
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

  const changeCmd = program.command("change").description("Gated tenant data change (local LLM safe)");
  changeCmd
    .command("plan")
    .description("Build a graded change proposal from intent JSON/YAML")
    .option("--intent-file <path>", "Intent YAML/JSON file")
    .option("--intent-json <json>", "Intent JSON string")
    .option("--no-save", "Do not write proposal under data/operator/change-proposals/")
    .option("--json", "JSON output")
    .action((opts) =>
      runChangePlan({
        intentFile: opts.intentFile,
        intentJson: opts.intentJson,
        save: opts.save,
        json: opts.json,
      })
    );
  changeCmd
    .command("apply")
    .description("Dry-run or apply a change proposal (grade C forbidden)")
    .requiredOption("--proposal <idOrPath>", "Proposal id or YAML path")
    .option("--write", "Write files (default dry-run)")
    .option("--dry-run", "Force dry-run")
    .option("--i-understand-grade-b", "Required for grade B write")
    .option("--operator <id>", "Operator id for audit")
    .option("--json", "JSON output")
    .action((opts) =>
      runChangeApply({
        proposal: opts.proposal,
        write: opts.write,
        dryRun: opts.dryRun,
        iUnderstandGradeB: opts.iUnderstandGradeB,
        operator: opts.operator,
        json: opts.json,
      })
    );

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
    .option("--approval-id <id>", "APR-... required for tier B/C --write (ADR 0037)")
    .action((opts) =>
      runBrokerTransfer({
        from: opts.from,
        amount: opts.amount,
        payee: opts.payee,
        reference: opts.reference,
        stakeholderId: opts.stakeholder,
        dryRun: !opts.confirm,
        write: opts.write ?? false,
        approvalId: opts.approvalId,
      })
    );
}
