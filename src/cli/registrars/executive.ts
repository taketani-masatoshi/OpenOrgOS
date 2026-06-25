import type { Command } from "commander";
import {
  runExecutiveCalendarList,
  runExecutiveCalendarConflicts,
  runExecutiveBrief,
  runExecutiveCalendarPush,
  runExecutiveCalendarPull,
  runExecutiveTasksArchive,
} from "../../commands/executive.js";
import { runSecretaryEscalate } from "../../commands/secretary.js";
import { runStatus } from "../../commands/status.js";

export function registerExecutiveCommands(program: Command): void {
  const executiveCmd = program
    .command("executive")
    .description("Secretary executive SoT — calendar · brief (data/executive/)");

  const executiveCalendar = executiveCmd.command("calendar").description("Executive calendar from calendar.yaml");
  executiveCalendar
    .command("list")
    .description("List events in date range (default: current week)")
    .option("--from <YYYY-MM-DD>", "Start date")
    .option("--to <YYYY-MM-DD>", "End date")
    .option("--json", "JSON output")
    .action((opts) => runExecutiveCalendarList({ from: opts.from, to: opts.to, json: opts.json }));
  executiveCalendar
    .command("conflicts")
    .description("Detect overlapping calendar events")
    .option("--json", "JSON output")
    .action((opts) => runExecutiveCalendarConflicts({ json: opts.json }));
  executiveCalendar
    .command("push")
    .description("Push calendar.yaml events to Google Calendar (YAML → Google · idempotent)")
    .option("--from <YYYY-MM-DD>", "Start date (default: current week)")
    .option("--to <YYYY-MM-DD>", "End date")
    .option("--dry-run", "Preview without API calls or YAML write")
    .option("--no-meet", "Do not request Google Meet links")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runExecutiveCalendarPush({
        from: opts.from,
        to: opts.to,
        dryRun: opts.dryRun,
        meet: opts.meet !== false,
        json: opts.json,
      })
    );
  executiveCalendar
    .command("pull")
    .description("Pull Google Calendar → YAML（google_event_id リンク · 差分一覧）")
    .option("--since <YYYY-MM-DD>", "Start date (default: today)")
    .option("--dry-run", "List diff only (default)", true)
    .option("--apply", "Write google_event_id links to calendar.yaml")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runExecutiveCalendarPull({
        since: opts.since,
        dryRun: opts.dryRun,
        apply: opts.apply,
        json: opts.json,
      })
    );

  executiveCmd
    .command("brief")
    .description("Generate weekly brief MD (Secretary · Monday morning)")
    .option("--week", "Current week (default)")
    .option("--date <YYYY-MM-DD>", "Reference date for week range")
    .option("--no-markdown", "Print to console only")
    .option("-o, --output <filename>", "Save to docs/reports/executive-brief/")
    .action((opts) =>
      runExecutiveBrief({
        output: opts.output,
        markdown: opts.markdown,
        referenceDate: opts.date,
      })
    );

  const executiveTasks = executiveCmd.command("tasks").description("Executive tasks.yaml");
  executiveTasks
    .command("archive")
    .description("Migrate cancelled → archived（Secretary 一覧ノイズ除去）")
    .option("--dry-run", "Count only")
    .action((opts) => runExecutiveTasksArchive({ dryRun: opts.dryRun }));

  const secretaryCmd = program
    .command("secretary")
    .description("Secretary operations — consult escalate without manual thread copy");
  secretaryCmd
    .command("escalate")
    .description("Write CONSULT MD + optional webhook (secretary_escalation orchestrator)")
    .requiredOption("--subject <text>", "Escalation subject (one line)")
    .option("--background <text>", "Background")
    .option("--q <question>", "Question (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--confidential <level>", "L0 | L1 | L2", "L1")
    .option("--format <text>", "Desired response format")
    .option("--memo <text>", "Secretary memo")
    .option("--webhook", "POST to steward/webhook outbound (if configured)")
    .option("--dispatch", "CONSULT + handoff + queue（Steward スレッド不要）")
    .option("--dry-run", "Print markdown only; do not write file")
    .option("--print", "Print markdown to stdout")
    .action(async (opts) =>
      runSecretaryEscalate({
        subject: opts.subject,
        background: opts.background,
        question: opts.q,
        confidential: opts.confidential,
        format: opts.format,
        memo: opts.memo,
        webhook: opts.webhook,
        dispatch: opts.dispatch,
        dryRun: opts.dryRun,
        print: opts.print,
      })
    );

  program
    .command("status")
    .description("Maturity report (preparedness / operational / automation)")
    .option("--markdown", "Markdown output")
    .option("--verbose", "Include integrity warnings")
    .option("--legacy", "Append legacy data-health breakdown")
    .option("--os-99", "Append company OS composite score (OS-99+ Epic)")
    .option("-o, --output <filename>", "Save to docs/reports/status/")
    .action((opts) =>
      runStatus({
        markdown: opts.markdown,
        verbose: opts.verbose,
        legacy: opts.legacy,
        os99: opts.os99,
        output: opts.output,
      })
    );
}
