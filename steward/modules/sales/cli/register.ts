import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
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
} from "../../../../src/commands/sales.js";

export const MODULE_ID = "sales";

function runSalesCrmSummarySkill(opts: SkillRunOptions): void {
  runSalesSummary({
    days: opts.days ?? 14,
    staleDays: opts.staleDays ?? 14,
    includeDemo: false,
    json: Boolean(opts.json),
  });
  runSalesCrmDashboard({ json: Boolean(opts.json) });
}

function runSalesInboundIntakeSkill(opts: SkillRunOptions): void {
  runSalesInboundIntake({ dryRun: Boolean(opts.dryRun) });
}

function registerSalesOperationsCommands(operationsCmd: Command): void {
  const sales = operationsCmd.command("sales").description("Sales pipeline and CRM SoT");
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
      const { requireCliDataWrite } = await import("../../../../src/lib/console-auth/cli-operator.js");
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
      );
      const permission = opts.stage === "won" || opts.reopen ? "chat:approve" : "escalate:plan";
      requireCliDataWrite({ command: "sales deal set-stage", permission });
      runSalesDealSetStage({
        dealId,
        stage: opts.stage as (typeof SALES_DEAL_STAGES)[number],
        lostReason: opts.lostReason as import("../../../../schemas/sales.js").SalesLostReason | undefined,
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
      );
      requireCliDataWrite({ command: "sales inquiry-set-status", permission: "escalate:plan" });
      runSalesInquirySetStatus({
        inquiryId,
        status: opts.status as import("../../../../schemas/sales.js").SalesInquiryStatus,
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
      const { requireCliDataWrite } = await import("../../../../src/lib/console-auth/cli-operator.js");
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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
        "../../../../src/lib/console-auth/cli-operator.js"
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

}

export const salesCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerSalesOperationsCommands(ctx.operationsCmd);
  },
  skillHandlers: {
    sales_crm_summary: runSalesCrmSummarySkill,
    sales_inbound_intake: runSalesInboundIntakeSkill,
  },
};
