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
import { runContactsResolve, runContactsRegister } from "../../commands/secretary-contacts.js";
import { buildGmailComposeUrl } from "../../lib/mail-compose-url.js";
import { runStatus } from "../../commands/status.js";
import {
  runMailIntakeSync,
  runMailIntakeList,
  runMailIntakeTriage,
  runMailIntakeHandoff,
  runMailIntakeOverride,
  runMailIntakeStatus,
  runMailIntakeSenderIdentify,
  runMailIntakeSenderList,
  runMailIntakeSenderConfirm,
  runMailIntakeSenderRegister,
  runMailIntakeSenderShow,
  runMailIntakeCeoList,
  runMailIntakeCeoShow,
  runMailIntakeCeoAnswer,
  parseCeoFieldArgs,
  runMailIntakeWireScan,
  runMailIntakeInterpret,
  runMailSetupGmail,
  runMailSetupGmailAuth,
} from "../../commands/mail-intake.js";
import {
  runCorrespondenceDraft,
  runCorrespondenceList,
  runCorrespondenceShow,
  runCorrespondenceSend,
  runSecretaryMailList,
  runSecretaryMailConfig,
  runSecretaryMailSetupGuide,
} from "../../commands/mail-outbound.js";
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
    .action(async (opts) =>
      runSchedulingReminderPollCommand({ json: opts.json, at: opts.at })
    );

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
    .action((opts) =>
      runSchedulingCancel({ id: opts.id, reason: opts.reason, json: opts.json })
    );

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
    .description("Approval-gated outbound email/Slack (legacy alias → mail outbound)");

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
    .option("--no-cc-defaults", "Skip automatic oversight CC (CEO 等)")
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

  const secretaryMailCmd = secretaryCmd.command("mail").description("Executive mail (legacy alias → mail outbound)");
  secretaryMailCmd
    .command("list")
    .description("List correspondence mail archive (sent drafts · mail-received/ · not docs/io/inbox)")
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
  secretaryMailCmd
    .command("config")
    .description("Show mail config status (L2 secrets via env)")
    .option("--json", "JSON output")
    .action((opts) => runSecretaryMailConfig(opts));

  secretaryMailCmd
    .command("setup-guide")
    .description("Mail/Slack setup checklist — blocks send until resolved")
    .option("--json", "JSON output")
    .action((opts) => runSecretaryMailSetupGuide(opts));

  const contactsCmd = secretaryCmd
    .command("contacts")
    .description("Contact registry lookup and update (Secretary · no guessing)");

  contactsCmd
    .command("resolve")
    .description("Resolve person/org/department against self + counterparty + peer tenant DBs")
    .option("--name <text>", "Person name (partial match)")
    .option("--org <text>", "Organization name (partial match)")
    .option("--department <text>", "Department or role (partial match)")
    .option("--ext-id <id>", "external-contacts id (EXT-...)")
    .option("--stakeholder-id <id>", "stakeholder id (STK-...)")
    .option("--json", "JSON output")
    .action((opts) =>
      runContactsResolve({
        name: opts.name,
        org: opts.org,
        department: opts.department,
        extId: opts.extId,
        stakeholderId: opts.stakeholderId,
        json: opts.json,
      })
    );

  contactsCmd
    .command("register")
    .description("Register or update contact after human disclosure (external-contacts + stakeholders)")
    .requiredOption("--name <text>", "Contact person name")
    .option("--email <email>", "Email address")
    .option("--org <text>", "Organization")
    .option("--department <text>", "Department")
    .option("--role <text>", "Role / title")
    .option("--relationship <text>", "Relationship label")
    .option("--ext-id <id>", "Update existing EXT-* (optional)")
    .option("--stakeholder-id <id>", "Link STK-* and sync representative_contact")
    .option("--notes <text>", "Notes")
    .option("--source <text>", "Registration source tag", "human_disclosure")
    .option("--dry-run", "Preview existing matches without writing")
    .option("--json", "JSON output")
    .action((opts) =>
      runContactsRegister({
        name: opts.name,
        email: opts.email,
        org: opts.org,
        department: opts.department,
        role: opts.role,
        relationship: opts.relationship,
        extId: opts.extId,
        stakeholderId: opts.stakeholderId,
        notes: opts.notes,
        source: opts.source,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );

  secretaryMailCmd
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

  const mailCmd = program
    .command("mail")
    .description("Mail — intake (receive) · outbound (send)");

  const intakeCmd = mailCmd.command("intake").description("Inbound mail monitoring");
  intakeCmd
    .command("sync")
    .description("Fetch new mail via IMAP/Gmail (receive.sync)")
    .option("--watch", "Poll on poll_interval_sec until interrupted")
    .option("--dry-run", "Fetch without saving")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runMailIntakeSync({ watch: opts.watch, dryRun: opts.dryRun, json: opts.json })
    );
  intakeCmd
    .command("wire-scan")
    .description("Scan mail-received for OpenOrgOS Wire MIME attachments (Phase 2 ingest)")
    .option("--since-days <n>", "Only scan files modified within N days", (v) => Number(v))
    .option("--dry-run", "Detect without ingest")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runMailIntakeWireScan({
        sinceDays: opts.sinceDays,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );
  intakeCmd
    .command("list")
    .description("List triage queue + receive state")
    .option("--unprocessed", "Secretary handoff pending only")
    .option("--json", "JSON output")
    .action((opts) => runMailIntakeList({ unprocessed: opts.unprocessed, json: opts.json }));
  intakeCmd
    .command("triage")
    .description("Rule-based triage for unqueued .eml files")
    .option("--no-notify", "Skip high-priority notifications")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runMailIntakeTriage({ notify: opts.notify !== false, json: opts.json })
    );
  intakeCmd
    .command("handoff")
    .description("Create inbound draft for Mail Outbound")
    .requiredOption("--id <messageId>", "Triage entry id (MSG-...)")
    .option("--to <agent>", "Target agent", "mail_outbound")
    .option("--json", "JSON output")
    .action((opts) => runMailIntakeHandoff({ id: opts.id, to: opts.to, json: opts.json }));
  intakeCmd
    .command("override")
    .description("Manual triage override")
    .requiredOption("--id <messageId>", "Triage entry id")
    .option("--importance <p0|p1|p2|p3>", "Importance")
    .option("--urgency <immediate|today|week|none>", "Urgency")
    .option("--disposition <ham|spam|suspicious|unknown>", "Disposition")
    .option("--routing <secretary|archive|ignore>", "Routing")
    .option("--json", "JSON output")
    .action((opts) => runMailIntakeOverride(opts));
  intakeCmd
    .command("status")
    .description("Mail intake readiness and queue counts")
    .option("--json", "JSON output")
    .action((opts) => runMailIntakeStatus({ json: opts.json }));

  intakeCmd
    .command("interpret")
    .description("Run mail interpretation ensemble (+ CEO inline ask on low agreement)")
    .option("--id <messageId>", "Single triage entry id (MSG-...)")
    .option("--json", "JSON output")
    .action(async (opts) => runMailIntakeInterpret({ id: opts.id, json: opts.json }));

  const mailSetupCmd = mailCmd.command("setup").description("Mail provider setup helpers");
  mailSetupCmd
    .command("gmail")
    .description("Gmail API ワンショット初期設定（OAuth client · mail-config · トークン）")
    .option("--from <email>", "送信元 Gmail アドレス")
    .option("--name <text>", "送信者表示名", "OrgOS Secretary")
    .option("--non-interactive", "対話プロンプトなし（env または L2 client 必須）")
    .option("--community-link", "Community 経由 Gmail 連携 URL を発行（ローカル OAuth なし）")
    .option("--tenant <id>", "テナント ID（既定: ORGOS_TENANT）")
    .option(
      "--community-url <url>",
      "Community ベース URL（既定: ORGOS_COMMUNITY_URL または https://community.oorgos.org）"
    )
    .option("--ttl-minutes <n>", "bind nonce TTL（分）", "30")
    .option(
      "--expect-email <email>",
      "Community 連携を許可する Google メール（CEO/operator）。未指定時は nonce URL 保持者なら可"
    )
    .option("--no-open", "ブラウザを自動で開かない")
    .option("--port <n>", "OAuth callback ポート")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runMailSetupGmail({
        json: opts.json,
        from: opts.from,
        name: opts.name,
        nonInteractive: opts.nonInteractive,
        communityLink: opts.communityLink,
        tenantId: opts.tenant,
        communityUrl: opts.communityUrl,
        ttlMinutes: opts.ttlMinutes ? parseInt(opts.ttlMinutes, 10) : undefined,
        expectEmail: opts.expectEmail,
        noOpen: opts.noOpen,
        port: opts.port ? parseInt(opts.port, 10) : undefined,
      })
    );
  mailSetupCmd
    .command("gmail-auth")
    .description("Gmail OAuth のみ（再認可 · --code）— 初回は mail setup gmail を推奨")
    .option("--code <code>", "Authorization code from redirect (manual flow)")
    .option("--url-only", "Print authorize URL only (do not start local callback server)")
    .option("--no-open", "Do not open browser automatically")
    .option("--port <n>", "Local callback port (default from ORGOS_GMAIL_REDIRECT_URI)")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runMailSetupGmailAuth({
        json: opts.json,
        code: opts.code,
        listen: !opts.urlOnly,
        noOpen: opts.noOpen,
        port: opts.port ? parseInt(opts.port, 10) : undefined,
      })
    );

  const intakeSender = intakeCmd
    .command("sender")
    .description("Unknown sender identification — web search · CEO confirm · registry");
  intakeSender
    .command("identify")
    .description("Resolve sender · web search · CEO question for unknown senders")
    .requiredOption("--id <messageId>", "Triage entry id (MSG-...)")
    .option("--skip-web-search", "Skip DuckDuckGo lookup")
    .option("--skip-ceo-ask", "Skip CEO inline question")
    .option("--dry-run", "Preview without writing")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runMailIntakeSenderIdentify({
        id: opts.id,
        skipWebSearch: opts.skipWebSearch,
        skipCeoAsk: opts.skipCeoAsk,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );
  intakeSender
    .command("list")
    .description("List sender identification queue")
    .option("--pending", "CEO confirmation pending only")
    .option("--json", "JSON output")
    .action((opts) => runMailIntakeSenderList({ pending: opts.pending, json: opts.json }));
  intakeSender
    .command("show")
    .description("Show sender identification for a mail id")
    .requiredOption("--id <messageId>", "Triage entry id")
    .option("--json", "JSON output")
    .action((opts) => runMailIntakeSenderShow({ id: opts.id, json: opts.json }));
  intakeSender
    .command("confirm")
    .description("Record CEO-confirmed sender identity (before register)")
    .requiredOption("--id <messageId>", "Triage entry id")
    .requiredOption("--name <text>", "Confirmed person name")
    .option("--org <text>", "Organization")
    .option("--department <text>", "Department")
    .option("--role <text>", "Role / title")
    .option("--relationship <text>", "Relationship")
    .option("--notes <text>", "Notes")
    .option("--web-search-trusted", "CEO confirmed web search result is accurate")
    .option("--operator <id>", "Confirming operator id")
    .option("--json", "JSON output")
    .action((opts) =>
      runMailIntakeSenderConfirm({
        id: opts.id,
        name: opts.name,
        org: opts.org,
        department: opts.department,
        role: opts.role,
        relationship: opts.relationship,
        notes: opts.notes,
        webSearchTrusted: opts.webSearchTrusted,
        operator: opts.operator,
        json: opts.json,
      })
    );
  intakeSender
    .command("register")
    .description("Register CEO-confirmed sender to external-contacts")
    .requiredOption("--id <messageId>", "Triage entry id")
    .option("--json", "JSON output")
    .action((opts) => runMailIntakeSenderRegister({ id: opts.id, json: opts.json }));

  const intakeCeo = intakeCmd
    .command("ceo")
    .description("CEO inline questions — Today / Steward Chat（CONSULT MD 代替）");
  intakeCeo
    .command("list")
    .description("List pending CEO inline questions")
    .option("--all", "Include answered/dismissed")
    .option("--json", "JSON output")
    .action((opts) => runMailIntakeCeoList({ pending: !opts.all, json: opts.json }));
  intakeCeo
    .command("show")
    .description("Show CEO inline question detail")
    .requiredOption("--id <questionId>", "CEO-Q-...")
    .option("--json", "JSON output")
    .action((opts) => runMailIntakeCeoShow({ id: opts.id, json: opts.json }));
  intakeCeo
    .command("answer")
    .description("Record CEO answers (--field <fieldId> <value> repeatable)")
    .requiredOption("--id <questionId>", "CEO-Q-...")
    .option("--operator <id>", "Answering operator id")
    .option("--json", "JSON output")
    .allowUnknownOption()
    .allowExcessArguments(true)
    .action(async (opts) =>
      await runMailIntakeCeoAnswer({
        id: opts.id,
        fields: parseCeoFieldArgs(process.argv),
        operator: opts.operator,
        json: opts.json,
      })
    );

  const outboundCmd = mailCmd.command("outbound").description("Outbound mail · Slack (approval-gated)");
  const outboundCorrespondence = outboundCmd
    .command("correspondence")
    .description("Approval-gated outbound email/Slack (Mail Outbound)");
  outboundCorrespondence
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
    .option("--no-cc-defaults", "Skip automatic oversight CC (CEO 等)")
    .option("--json", "JSON output")
    .action((opts) => runCorrespondenceDraft(opts));
  outboundCorrespondence
    .command("list")
    .description("List correspondence drafts")
    .option("--status <status>", "Filter by status")
    .option("--channel <email|slack>", "Filter by channel")
    .option("--json", "JSON output")
    .action((opts) => runCorrespondenceList(opts));
  outboundCorrespondence
    .command("show")
    .description("Show draft metadata")
    .argument("<id>", "Draft ID")
    .option("--json", "JSON output")
    .action((id, opts) => runCorrespondenceShow({ id, ...opts }));
  outboundCorrespondence
    .command("send")
    .description("Send approved draft (SMTP / Slack webhook · records company event)")
    .requiredOption("--id <draftId>", "Draft ID")
    .option("--operator <id>", "Sending operator id")
    .option("--dry-run", "Validate gate without delivery")
    .option("--json", "JSON output")
    .action(async (opts) => runCorrespondenceSend(opts));

  const outboundMail = outboundCmd.command("mail").description("Mail config · archive");
  outboundMail
    .command("list")
    .description("List correspondence mail archive")
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
  outboundMail
    .command("config")
    .description("Show mail config status (L2 secrets via env)")
    .option("--json", "JSON output")
    .action((opts) => runSecretaryMailConfig(opts));
  outboundMail
    .command("setup-guide")
    .description("Mail/Slack setup checklist — blocks send until resolved")
    .option("--json", "JSON output")
    .action((opts) => runSecretaryMailSetupGuide(opts));

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
