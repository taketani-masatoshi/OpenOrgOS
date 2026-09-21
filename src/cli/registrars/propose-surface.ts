/**
 * Propose-only CLI. Path: src/cli/registrars/propose-surface.ts
 * Prints proposals. Does not send, transfer, or approve.
 */
import { writeFileSync } from "node:fs";
import type { Command } from "commander";
import {
  bridgeEventIndex,
  buildDailyCashSeries,
  draftLostDealFollowup,
  extractBant,
  findSodConflicts,
  proposeExpenseIntake,
  proposePayrollTransfer,
  scanBottlenecks,
  scanFollowups,
  summarizeProjectPl,
} from "../../lib/propose-surface.js";
import { buildAuditPackIndex } from "../../lib/audit-pack/index.js";

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
    .requiredOption("--duties <json>", "JSON array of {action,actorId,subjectId}")
    .action((opts: { duties: string }) => {
      const issues = findSodConflicts(readJson(opts.duties));
      printJson({ ok: issues.length === 0, issues });
      if (issues.length > 0) process.exitCode = 1;
    });

  program
    .command("followup")
    .description("Due-date draft scan")
    .command("scan")
    .requiredOption("--items <json>", "JSON array of {id,dueOn,kind}")
    .requiredOption("--as-of <date>", "YYYY-MM-DD")
    .option("--within-days <n>", "Horizon", (value) => Number(value), 7)
    .action((opts: { items: string; asOf: string; withinDays: number }) => {
      printJson({
        drafts: scanFollowups(readJson(opts.items), opts.asOf, opts.withinDays),
        sent: false,
      });
    });

  program
    .command("bottleneck")
    .description("Stuck-work scan")
    .command("scan")
    .requiredOption("--items <json>", "JSON array of {id,ownerId,waitingSince,kind}")
    .requiredOption("--as-of <date>", "YYYY-MM-DD")
    .option("--stuck-days <n>", "Minimum days", (value) => Number(value), 3)
    .action((opts: { items: string; asOf: string; stuckDays: number }) => {
      printJson({
        items: scanBottlenecks(readJson(opts.items), opts.asOf, opts.stuckDays),
        notified: false,
      });
    });

  program
    .command("trace")
    .description("Digest index for the company event chain")
    .command("bridge")
    .requiredOption("--refs <json>", "JSON array of {kind,id}")
    .action((opts: { refs: string }) => {
      printJson({ index: bridgeEventIndex(readJson(opts.refs)), wroteChain: false });
    });

  program
    .command("expense-intake")
    .description("Expense reference intake. Photo bytes are refused")
    .requiredOption("--channel <name>", "line | slack | mail | chat")
    .requiredOption("--ref <id>", "Reference id")
    .action((opts: { channel: "line" | "slack" | "mail" | "chat"; ref: string }) => {
      printJson(proposeExpenseIntake({ channel: opts.channel, referenceId: opts.ref }));
    });

  program
    .command("payroll-propose")
    .description("Payroll broker-transfer proposal. Does not pay or file tax")
    .requiredOption("--run <id>", "Payroll run id")
    .requiredOption("--total-yen <n>", "Total yen", (value) => Number(value))
    .action((opts: { run: string; totalYen: number }) => {
      printJson(proposePayrollTransfer({ payrollRunId: opts.run, totalYen: opts.totalYen }));
    });

  const audit = program.commands.find((cmd) => cmd.name() === "audit");
  audit
    ?.command("pack")
    .description("Index sample transaction ids. Does not copy file bodies")
    .requiredOption("--samples <json>", "JSON array of sample refs")
    .action((opts: { samples: string }) => {
      printJson(buildAuditPackIndex(readJson(opts.samples)));
    });

  const ledger = program.commands.find((cmd) => cmd.name() === "ledger");
  ledger
    ?.command("pl")
    .description("Project P/L from journal lines that carry project_code")
    .requiredOption("--by-project", "Group by project_code")
    .requiredOption("--entries <json>", "JSON array of {lines}")
    .action((opts: { entries: string }) => {
      printJson({ rows: summarizeProjectPl(readJson(opts.entries)) });
    });
  ledger
    ?.command("cashflow-daily")
    .description("Daily cash series from opening balance plus dated flows")
    .requiredOption("--opening-yen <n>", "Opening yen", (value) => Number(value))
    .requiredOption("--from <date>", "YYYY-MM-DD")
    .requiredOption("--to <date>", "YYYY-MM-DD")
    .requiredOption("--flows <json>", "JSON array of {date,yen}")
    .action((opts: { openingYen: number; from: string; to: string; flows: string }) => {
      printJson(
        buildDailyCashSeries({
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
      const { renderQuotePdf } = await import("../../lib/propose-surface.js");
      const pdf = await renderQuotePdf({
        quoteId: opts.quoteId,
        title: opts.title,
        amountYen: opts.amountYen,
      });
      if (opts.out) writeFileSync(opts.out, pdf);
      printJson({ quoteId: opts.quoteId, bytes: pdf.length, sent: false });
    });

  sales
    ?.command("bant")
    .description("BANT candidates from a transcript fixture. Stage apply is human")
    .requiredOption("--transcript <text>", "Transcript text")
    .action((opts: { transcript: string }) => {
      printJson(extractBant(opts.transcript));
    });

  sales
    ?.command("lost-deal-draft")
    .description("Draft a follow-up for a silent deal. Does not push")
    .requiredOption("--deal <id>", "Deal id")
    .requiredOption("--silent-days <n>", "Days without movement", (value) => Number(value))
    .action((opts: { deal: string; silentDays: number }) => {
      printJson(draftLostDealFollowup({ dealId: opts.deal, silentDays: opts.silentDays }));
    });
}
