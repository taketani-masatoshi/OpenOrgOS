/**
 * Propose-only CLI. Path: src/cli/registrars/propose-surface.ts
 * Prints proposals. Does not send, transfer, or approve.
 */
import { writeFileSync } from "node:fs";
import type { Command } from "commander";
import {
  renderAiaCycleReport,
  renderBantReport,
  renderBottleneckReport,
  renderCashflowReport,
  renderExpenseIntakeReport,
  renderFollowupReport,
  renderLostDealFollowupReport,
  renderPayrollTransferReport,
  renderProjectPlReport,
  renderSodReport,
  renderTraceBridgeReport,
} from "../../lib/propose-surface.js";
import { renderAuditPack } from "../../lib/audit-pack/index.js";

function readJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function registerProposeSurfaceCommands(program: Command): void {
  program
    .command("sod")
    .description("Segregation of duties check")
    .command("check")
    .option("--duties <json>", "JSON array of {action,actorId,subjectId} (omit to read pending-approvals)")
    .action((opts: { duties?: string }) => {
      const report = renderSodReport(opts.duties ? readJson(opts.duties) : undefined);
      printJson(report);
      if (!report.ok) process.exitCode = 1;
    });

  program
    .command("followup")
    .description("Due-date draft scan")
    .command("scan")
    .option("--items <json>", "JSON array of {id,dueOn,kind} (omit to read sales pipeline)")
    .requiredOption("--as-of <date>", "YYYY-MM-DD")
    .option("--within-days <n>", "Horizon", (value) => Number(value), 7)
    .action((opts: { items?: string; asOf: string; withinDays: number }) => {
      printJson(
        renderFollowupReport(
          opts.items ? readJson(opts.items) : undefined,
          opts.asOf,
          opts.withinDays,
        ),
      );
    });

  program
    .command("bottleneck")
    .description("Stuck-work scan")
    .command("scan")
    .requiredOption("--items <json>", "JSON array of {id,ownerId,waitingSince,kind}")
    .requiredOption("--as-of <date>", "YYYY-MM-DD")
    .option("--stuck-days <n>", "Minimum days", (value) => Number(value), 3)
    .action((opts: { items: string; asOf: string; stuckDays: number }) => {
      printJson(renderBottleneckReport(readJson(opts.items), opts.asOf, opts.stuckDays));
    });

  program
    .command("trace")
    .description("Digest index for the company event chain")
    .command("bridge")
    .requiredOption("--refs <json>", "JSON array of {kind,id}")
    .action((opts: { refs: string }) => {
      printJson(renderTraceBridgeReport(readJson(opts.refs)));
    });

  program
    .command("expense-intake")
    .description("Expense reference intake. Photo bytes are refused")
    .requiredOption("--channel <name>", "line | slack | mail | chat")
    .requiredOption("--ref <id>", "Reference id")
    .action((opts: { channel: "line" | "slack" | "mail" | "chat"; ref: string }) => {
      printJson(renderExpenseIntakeReport({ channel: opts.channel, referenceId: opts.ref }));
    });

  program
    .command("payroll-propose")
    .description("Payroll broker-transfer proposal. Does not pay or file tax")
    .requiredOption("--run <id>", "Payroll run id")
    .option("--total-yen <n>", "Total yen (omit to read payroll.yaml)", (value) => Number(value))
    .action((opts: { run: string; totalYen?: number }) => {
      printJson(
        renderPayrollTransferReport({
          payrollRunId: opts.run,
          totalYen: opts.totalYen,
        }),
      );
    });

  const audit = program.commands.find((cmd) => cmd.name() === "audit");
  audit
    ?.command("pack")
    .description("Index sample transaction ids. Does not copy file bodies")
    .requiredOption("--samples <json>", "JSON array of sample refs")
    .action((opts: { samples: string }) => {
      printJson(renderAuditPack(readJson(opts.samples)));
    });

  const ledger = program.commands.find((cmd) => cmd.name() === "ledger");
  ledger
    ?    .command("pl")
    .description("Project P/L from journal lines that carry project_code")
    .requiredOption("--by-project", "Group by project_code")
    .option("--entries <json>", "JSON array of {lines} (omit to read journal-entries.yaml)")
    .action((opts: { entries?: string }) => {
      printJson(renderProjectPlReport(opts.entries ? readJson(opts.entries) : undefined));
    });
  ledger
    ?.command("cashflow-daily")
    .description("Daily cash series from opening balance plus dated flows")
    .option("--opening-yen <n>", "Opening yen (omit to read cash-balance.yaml)", (value) =>
      Number(value),
    )
    .requiredOption("--from <date>", "YYYY-MM-DD")
    .requiredOption("--to <date>", "YYYY-MM-DD")
    .requiredOption("--flows <json>", "JSON array of {date,yen}")
    .action((opts: { openingYen?: number; from: string; to: string; flows: string }) => {
      printJson(
        renderCashflowReport({
          openingYen: opts.openingYen,
          from: opts.from,
          to: opts.to,
          flows: readJson(opts.flows),
        }),
      );
    });

  const sales = program.commands.find((cmd) => cmd.name() === "sales");
  const quote = sales?.commands.find((cmd) => cmd.name() === "quote");
  quote
    ?.command("render")
    .description("Render a quote PDF draft. Sending stays on chat:approve")
    .requiredOption("--quote-id <id>", "Quote id")
    .requiredOption("--title <text>", "Title")
    .requiredOption("--amount-yen <n>", "Amount yen", (value) => Number(value))
    .option("--out <path>", "Write the PDF here")
    .action(async (opts: { quoteId: string; title: string; amountYen: number; out?: string }) => {
      const { renderQuoteDraftReport } = await import("../../lib/propose-surface.js");
      const report = await renderQuoteDraftReport({
        quoteId: opts.quoteId,
        title: opts.title,
        amountYen: opts.amountYen,
      });
      if (opts.out) writeFileSync(opts.out, report.pdf);
      printJson({
        kind: report.kind,
        quoteId: report.quoteId,
        bytes: report.bytes,
        sent: report.sent,
        autoAssemble: report.autoAssemble,
      });
    });

  sales
    ?.command("bant")
    .description("BANT candidates from a transcript fixture. Stage apply is human")
    .requiredOption("--transcript <text>", "Transcript text")
    .option("--deal <id>", "Optional deal id to bind stage proposal")
    .action((opts: { transcript: string; deal?: string }) => {
      printJson(renderBantReport(opts.transcript, opts.deal ? { dealId: opts.deal } : undefined));
    });

  sales
    ?.command("lost-deal-draft")
    .description("Draft a follow-up for a silent deal. Does not push")
    .option("--deal <id>", "Deal id (omit with --as-of to scan pipeline)")
    .option("--silent-days <n>", "Days without movement", (value) => Number(value))
    .option("--as-of <date>", "YYYY-MM-DD for pipeline scan")
    .option("--silent-days-threshold <n>", "Pipeline scan threshold", (value) => Number(value), 14)
    .action(
      (opts: {
        deal?: string;
        silentDays?: number;
        asOf?: string;
        silentDaysThreshold: number;
      }) => {
        printJson(
          renderLostDealFollowupReport({
            dealId: opts.deal,
            silentDays: opts.silentDays,
            asOf: opts.asOf,
            silentDaysThreshold: opts.silentDaysThreshold,
          }),
        );
      },
    );

  const aia = program.commands.find((cmd) => cmd.name() === "aia");
  aia
    ?.command("propose-cycle")
    .description("List followup, bottleneck, and dispatch proposals. Does not loop or execute")
    .requiredOption("--followups <json>", "JSON array of {id}")
    .requiredOption("--bottlenecks <json>", "JSON array of {id}")
    .requiredOption("--dispatch <json>", "JSON array of {jobId}")
    .action((opts: { followups: string; bottlenecks: string; dispatch: string }) => {
      printJson(
        renderAiaCycleReport({
          followups: readJson(opts.followups),
          bottlenecks: readJson(opts.bottlenecks),
          dispatch: readJson(opts.dispatch),
        }),
      );
    });
}
