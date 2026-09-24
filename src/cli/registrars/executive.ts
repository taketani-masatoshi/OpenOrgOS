import type { Command } from "commander";
import {
  runExecutiveCalendarList,
  runExecutiveCalendarConflicts,
  runExecutiveBrief,
  runExecutiveCalendarPush,
  runExecutiveCalendarPull,
  runExecutiveTasksArchive,
  runExecutiveTasksList,
  runExecutiveTasksAdd,
  runExecutiveTasksClose,
  runExecutiveTasksIntake,
  runExecutiveTasksImportP0,
} from "../../commands/executive.js";
import { runStatus } from "../../commands/status.js";
import { registerMailCommands, registerSecretaryCommands } from "./correspondence.js";
import {
  runSchedulingAutoProcess,
  runSchedulingCancel,
  runSchedulingClose,
  runSchedulingConfirm,
  runSchedulingDraft,
  runSchedulingLinkMail,
  runSchedulingList,
  runSchedulingNew,
  runSchedulingPropose,
  runSchedulingProcess,
  runSchedulingReminderPollCommand,
  runSchedulingRespond,
  runSchedulingReschedule,
  runSchedulingShow,
} from "../../commands/scheduling-coordination.js";
import { runSchedulingRehearsal } from "../../commands/scheduling-rehearsal.js";

export function registerExecutiveCommands(program: Command): void {
  const executiveCmd = program
    .command("executive")
    .description("Secretary executive SoT — calendar · brief (data/executive/)");

  const executiveCalendar = executiveCmd
    .command("calendar")
    .description("Executive calendar from calendar.yaml");
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
    .command("list")
    .description("List tasks.yaml + candidate sources")
    .option("--priority <p0|p1|p2|p3>", "Filter by priority")
    .option("--status <status>", "Filter by status")
    .option("--json", "JSON output")
    .action((opts) =>
      runExecutiveTasksList({
        priority: opts.priority,
        status: opts.status,
        json: opts.json,
      })
    );
  executiveTasks
    .command("add")
    .description("Add a task to tasks.yaml")
    .requiredOption("--title <title>", "Task title")
    .option("--due <YYYY-MM-DD>", "Due date")
    .option("--priority <p0|p1|p2|p3>", "Priority", "p2")
    .option("--property <PROP-id>", "Property id")
    .option("--module <module_id>", "Module id")
    .option("--json", "JSON output")
    .action((opts) =>
      runExecutiveTasksAdd({
        title: opts.title,
        due: opts.due,
        priority: opts.priority,
        property: opts.property,
        module: opts.module,
        json: opts.json,
      })
    );
  executiveTasks
    .command("close")
    .description("Mark a task done (or cancelled)")
    .requiredOption("--id <TASK-id>", "TASK-001")
    .option("--notes <text>", "Completion note")
    .option("--cancel", "Set status cancelled instead of done")
    .option("--json", "JSON output")
    .action((opts) =>
      runExecutiveTasksClose({
        id: opts.id,
        notes: opts.notes,
        cancel: opts.cancel,
        json: opts.json,
      })
    );
  executiveTasks
    .command("intake")
    .description("Promote a candidate (triage / work-order / approval) into tasks.yaml")
    .option("--triage <id>", "Mail triage entry id")
    .option("--work-order <id>", "Work order / handoff id")
    .option("--approval <id>", "Pending approval id")
    .option("--json", "JSON output")
    .action((opts) =>
      runExecutiveTasksIntake({
        triage: opts.triage,
        workOrder: opts.workOrder,
        approval: opts.approval,
        json: opts.json,
      })
    );
  executiveTasks
    .command("import-p0")
    .description("One-shot import from docs/company/executive-remaining-tasks.md (default dry-run)")
    .option("--file <path>", "Markdown checklist path")
    .option("--write", "Write into tasks.yaml (default dry-run)")
    .option("--dry-run", "Force dry-run even with --write")
    .option("--json", "JSON output")
    .action((opts) =>
      runExecutiveTasksImportP0({
        file: opts.file,
        write: opts.write,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );
  executiveTasks
    .command("archive")
    .description("Migrate cancelled → archived（Secretary 一覧ノイズ除去）")
    .option("--dry-run", "Count only")
    .action((opts) => runExecutiveTasksArchive({ dryRun: opts.dryRun }));

  const schedulingCmd = executiveCmd
    .command("scheduling")
    .description("Multi-party schedule coordination via email (Secretary)");

  schedulingCmd
    .command("list")
    .description("List scheduling cases")
    .option("--status <status>", "Filter by status")
    .option("--all", "Include closed/cancelled")
    .option("--json", "JSON output")
    .action((opts) =>
      runSchedulingList({ status: opts.status, json: opts.json, active: !opts.all })
    );

  schedulingCmd
    .command("show")
    .description("Show scheduling case detail")
    .requiredOption("--id <caseId>", "SCH-YYYY-NNN")
    .option("--json", "JSON output")
    .action((opts) => runSchedulingShow({ id: opts.id, json: opts.json }));

  schedulingCmd
    .command("new")
    .description("Create scheduling case")
    .requiredOption("--title <title>", "Meeting title")
    .requiredOption(
      "--participant <spec>",
      "name|email|role|contact_ref (repeatable)",
      (v: string, arr: string[]) => {
        arr.push(v);
        return arr;
      },
      [] as string[]
    )
    .option("--duration <minutes>", "Slot duration", (v) => parseInt(v, 10))
    .option("--from <YYYY-MM-DD>", "Search from")
    .option("--to <YYYY-MM-DD>", "Search to")
    .option("--meeting-format <format>", "online|in_person|unspecified")
    .option("--location <text>", "Meeting location")
    .option("--json", "JSON output")
    .action((opts) =>
      runSchedulingNew({
        title: opts.title,
        participant: opts.participant,
        duration: opts.duration,
        from: opts.from,
        to: opts.to,
        meetingFormat: opts.meetingFormat,
        location: opts.location,
        json: opts.json,
      })
    );

  schedulingCmd
    .command("propose")
    .description("Propose candidate slots from CEO calendar")
    .requiredOption("--id <caseId>", "Case ID")
    .option("--from <YYYY-MM-DD>")
    .option("--to <YYYY-MM-DD>")
    .option("--count <n>", "Number of slots", (v) => parseInt(v, 10))
    .option("--json", "JSON output")
    .action((opts) =>
      runSchedulingPropose({
        id: opts.id,
        from: opts.from,
        to: opts.to,
        count: opts.count,
        json: opts.json,
      })
    );

  schedulingCmd
    .command("respond")
    .description("Record participant response")
    .requiredOption("--id <caseId>", "Case ID")
    .requiredOption("--response <status>", "accept|decline|counter|pending|unknown")
    .option("--email <email>", "Participant email")
    .option("--participant <partId>", "PART-NNN")
    .option("--slot-id <slotId>", "SLOT-NNN")
    .option("--mail-id <mailId>", "MSG-...")
    .option("--note <text>", "Response note")
    .option("--json", "JSON output")
    .action((opts) =>
      runSchedulingRespond({
        id: opts.id,
        email: opts.email,
        participant: opts.participant,
        response: opts.response,
        slotId: opts.slotId,
        mailId: opts.mailId,
        note: opts.note,
        json: opts.json,
      })
    );

  schedulingCmd
    .command("link-mail")
    .description("Link inbound mail to scheduling case")
    .requiredOption("--id <caseId>", "Case ID")
    .requiredOption("--mail-id <mailId>", "Mail triage ID")
    .option("--json", "JSON output")
    .action((opts) => runSchedulingLinkMail({ id: opts.id, mailId: opts.mailId, json: opts.json }));

  schedulingCmd
    .command("process")
    .description("Process schedule-intent mail against cases")
    .option("--mail-id <mailId>", "Single mail")
    .option("--all", "Process all pending schedule mails")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runSchedulingProcess({ mailId: opts.mailId, all: opts.all, json: opts.json })
    );

  schedulingCmd
    .command("auto-process")
    .description("Auto-link schedule mail after sync (Phase 3)")
    .option("--json", "JSON output")
    .action(async (opts) => runSchedulingAutoProcess({ json: opts.json }));

  schedulingCmd
    .command("reminder-poll")
    .description("Poll overdue scheduling reminders (independent of mail sync)")
    .option("--at <iso>", "Evaluate as-of timestamp (tests / replay)")
    .option("--json", "JSON output")
    .action(async (opts) => runSchedulingReminderPollCommand({ json: opts.json, at: opts.at }));

  schedulingCmd
    .command("confirm")
    .description("Confirm final slot")
    .requiredOption("--id <caseId>", "Case ID")
    .requiredOption("--slot-id <slotId>", "SLOT-NNN")
    .option("--write-calendar", "Write to calendar.yaml and push to Google")
    .option("--no-push-calendar", "Skip Google Calendar push")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runSchedulingConfirm({
        id: opts.id,
        slotId: opts.slotId,
        writeCalendar: opts.writeCalendar,
        pushCalendar: !opts.noPushCalendar,
        json: opts.json,
      })
    );

  schedulingCmd
    .command("draft")
    .description("Generate adjustment email draft")
    .requiredOption("--id <caseId>", "Case ID")
    .option("--kind <kind>", "proposal|reminder|confirm")
    .option("--write-draft", "Create correspondence draft + approval")
    .option("--participant <participantId>", "PART-NNN for individual reminder")
    .option("--json", "JSON output")
    .action((opts) =>
      runSchedulingDraft({
        id: opts.id,
        kind: opts.kind,
        writeDraft: opts.writeDraft,
        participant: opts.participant,
        json: opts.json,
      })
    );

  schedulingCmd
    .command("close")
    .description("Close scheduling case")
    .requiredOption("--id <caseId>", "Case ID")
    .option("--json", "JSON output")
    .action((opts) => runSchedulingClose({ id: opts.id, json: opts.json }));

  schedulingCmd
    .command("cancel")
    .description("Cancel scheduling case")
    .requiredOption("--id <caseId>", "Case ID")
    .option("--reason <text>", "Cancellation reason")
    .option("--json", "JSON output")
    .action((opts) => runSchedulingCancel({ id: opts.id, reason: opts.reason, json: opts.json }));

  schedulingCmd
    .command("reschedule")
    .description("Start a new proposal revision")
    .requiredOption("--id <caseId>", "Case ID")
    .option("--json", "JSON output")
    .action((opts) => runSchedulingReschedule({ id: opts.id, json: opts.json }));

  schedulingCmd
    .command("rehearsal")
    .description("Dry-run scheduling coordination end-to-end (setup · propose · reply · confirm)")
    .option("--full", "Run full rehearsal (default: setup readiness only)")
    .option("--setup-only", "Check mail/operator readiness without mutating cases")
    .option("--tenant <id>", "Tenant ID (default: ORGOS_TENANT)")
    .option("--json", "JSON output")
    .action((opts) =>
      runSchedulingRehearsal({
        full: opts.full,
        setupOnly: opts.setupOnly,
        tenant: opts.tenant,
        json: opts.json,
      })
    );

  registerSecretaryCommands(program);
  registerMailCommands(program);

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
