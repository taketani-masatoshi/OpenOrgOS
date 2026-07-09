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
import {
  runCorrespondenceDraft,
  runCorrespondenceList,
  runCorrespondenceShow,
  runCorrespondenceSend,
  runSecretaryMailList,
  runSecretaryMailConfig,
} from "../../commands/secretary-correspondence.js";
import { buildGmailComposeUrl } from "../../lib/mail-compose-url.js";
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

  const correspondenceCmd = secretaryCmd
    .command("correspondence")
    .description("Approval-gated outbound email/Slack (Secretary)");

  correspondenceCmd
    .command("draft")
    .description("Create correspondence draft + propose org approval")
    .option("--channel <email|slack>", "Delivery channel", "email")
    .option("--to <email>", "Recipient (email channel)")
    .option("--cc <email>", "CC (email channel)")
    .option("--subject <text>", "Email subject")
    .option("--body <text>", "Message body")
    .option("--body-file <path>", "Message body from file")
    .option("--slack-channel <name>", "Slack channel (slack channel)")
    .option("--contact-ref <id>", "external-contacts ref")
    .option("--notes <text>", "Internal notes")
    .option("--operator <id>", "Proposed-by operator id")
    .option("--no-approval", "Skip approval proposal (testing only)")
    .option("--json", "JSON output")
    .action((opts) => runCorrespondenceDraft(opts));

  correspondenceCmd
    .command("list")
    .description("List correspondence drafts")
    .option("--status <status>", "Filter by status")
    .option("--channel <email|slack>", "Filter by channel")
    .option("--json", "JSON output")
    .action((opts) => runCorrespondenceList(opts));

  correspondenceCmd
    .command("show")
    .description("Show draft metadata")
    .argument("<id>", "Draft ID")
    .option("--json", "JSON output")
    .action((id, opts) => runCorrespondenceShow({ id, ...opts }));

  correspondenceCmd
    .command("send")
    .description("Send approved draft (SMTP / Slack webhook · records company event)")
    .requiredOption("--id <draftId>", "Draft ID")
    .option("--operator <id>", "Sending operator id")
    .option("--dry-run", "Validate gate without delivery")
    .option("--json", "JSON output")
    .action(async (opts) => runCorrespondenceSend(opts));

  const mailCmd = secretaryCmd.command("mail").description("Executive mail access (read-only list · config)");
  mailCmd
    .command("list")
    .description("List sent/received mail (local index · inbox sync stub)")
    .option("--direction <sent|received|all>", "Filter direction", "all")
    .option("--limit <n>", "Max entries", "50")
    .option("--json", "JSON output")
    .action((opts) =>
      runSecretaryMailList({
        direction: opts.direction,
        limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
        json: opts.json,
      })
    );
  mailCmd
    .command("config")
    .description("Show mail config status (L2 secrets via env)")
    .option("--json", "JSON output")
    .action((opts) => runSecretaryMailConfig(opts));

  mailCmd
    .command("compose-url")
    .description("Build Gmail compose URL (no API send · human clicks to send)")
    .requiredOption("--to <email>", "Recipient")
    .requiredOption("--subject <text>", "Subject")
    .requiredOption("--body <text>", "Body")
    .option("--cc <email>", "CC")
    .action((opts) => {
      const url = buildGmailComposeUrl({
        to: opts.to,
        subject: opts.subject,
        body: opts.body,
        cc: opts.cc,
      });
      console.log(url);
    });

  program
    .command("status")
    .description("Maturity report (preparedness / operational / automation)")
    .option("--markdown", "Markdown output")
    .option("--verbose", "Include integrity warnings")
    .option("--legacy", "Append legacy data-health breakdown")
    .option("--os-99", "Append company OS composite score (OS-99+ Epic)")
    .option("--orgos", "Append OrgOS weighted completion score (§13)")
    .option("-o, --output <filename>", "Save to docs/reports/status/")
    .action((opts) =>
      runStatus({
        markdown: opts.markdown,
        verbose: opts.verbose,
        legacy: opts.legacy,
        os99: opts.os99,
        orgos: opts.orgos,
        output: opts.output,
      })
    );
}
