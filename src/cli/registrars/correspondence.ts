import type { Command } from "commander";
import { runSecretaryEscalate } from "../../commands/secretary.js";
import { runContactsResolve, runContactsRegister } from "../../commands/secretary-contacts.js";
import { buildGmailComposeUrl } from "../../lib/mail-compose-url.js";
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
  runMailIntakeThreadShow,
} from "../../commands/mail-intake.js";
import { runMailSetupGmail, runMailSetupGmailAuth } from "../../commands/mail-setup.js";
import {
  runCorrespondenceDraft,
  runCorrespondenceList,
  runCorrespondenceShow,
  runCorrespondenceSend,
  runCorrespondenceStyleLint,
  runCorrespondenceCompose,
  runCorrespondenceKnowledgeSearch,
  runCorrespondenceFactsVerify,
  runSecretaryMailList,
  runSecretaryMailConfig,
  runSecretaryMailSetupGuide,
} from "../../commands/mail-outbound.js";

/** Shared by `mail outbound correspondence` and the legacy `secretary correspondence` alias. */
function registerCorrespondenceDraftCommands(parent: Command): void {
  parent
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

  parent
    .command("list")
    .description("List correspondence drafts")
    .option("--status <status>", "Filter by status")
    .option("--channel <email|slack>", "Filter by channel")
    .option("--json", "JSON output")
    .action((opts) => runCorrespondenceList(opts));

  parent
    .command("show")
    .description("Show draft metadata")
    .argument("<id>", "Draft ID")
    .option("--json", "JSON output")
    .action((id, opts) => runCorrespondenceShow({ id, ...opts }));

  parent
    .command("send")
    .description("Send approved draft (SMTP / Slack webhook · records company event)")
    .requiredOption("--id <draftId>", "Draft ID")
    .option("--operator <id>", "Sending operator id")
    .option("--dry-run", "Validate gate without delivery")
    .option("--json", "JSON output")
    .action(async (opts) => runCorrespondenceSend(opts));
}

/** Shared by `mail outbound mail` and the legacy `secretary mail` alias. */
function registerMailArchiveCommands(parent: Command, listDescription: string): void {
  parent
    .command("list")
    .description(listDescription)
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

  parent
    .command("config")
    .description("Show mail config status (L2 secrets via env)")
    .option("--json", "JSON output")
    .action((opts) => runSecretaryMailConfig(opts));

  parent
    .command("setup-guide")
    .description("Mail/Slack setup checklist — blocks send until resolved")
    .option("--json", "JSON output")
    .action((opts) => runSecretaryMailSetupGuide(opts));
}

export function registerSecretaryCommands(program: Command): void {
  const secretaryCmd = program
    .command("secretary")
    .description("Secretary operations — consult escalate without manual thread copy");
  secretaryCmd
    .command("escalate")
    .description("Write CONSULT MD + optional webhook (secretary_escalation orchestrator)")
    .requiredOption("--subject <text>", "Escalation subject (one line)")
    .option("--background <text>", "Background")
    .option(
      "--q <question>",
      "Question (repeatable)",
      (v: string, prev: string[]) => [...prev, v],
      [] as string[]
    )
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

  registerCorrespondenceDraftCommands(correspondenceCmd);

  const secretaryMailCmd = secretaryCmd
    .command("mail")
    .description("Executive mail (legacy alias → mail outbound)");
  registerMailArchiveCommands(
    secretaryMailCmd,
    "List correspondence mail archive (sent drafts · mail-received/ · not docs/io/inbox)"
  );

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
    .description(
      "Register or update contact after human disclosure (external-contacts + stakeholders)"
    )
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
}

export function registerMailCommands(program: Command): void {
  const mailCmd = program.command("mail").description("Mail — intake (receive) · outbound (send)");

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

  const threadCmd = intakeCmd.command("thread").description("Gmail thread history");
  threadCmd
    .command("show")
    .description("Fetch/show Gmail thread (L1 summaries; body in mail-received)")
    .requiredOption("--id <threadOrMsgId>", "Gmail thread id or triage MSG-...")
    .option("--fetch", "Fetch missing messages via Gmail API")
    .option("--dry-run", "List only without saving")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runMailIntakeThreadShow({
        id: opts.id,
        fetch: opts.fetch,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );

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
    .action(
      async (opts) =>
        await runMailIntakeCeoAnswer({
          id: opts.id,
          fields: parseCeoFieldArgs(process.argv),
          operator: opts.operator,
          json: opts.json,
        })
    );

  const outboundCmd = mailCmd
    .command("outbound")
    .description("Outbound mail · Slack (approval-gated)");
  const outboundCorrespondence = outboundCmd
    .command("correspondence")
    .description("Approval-gated outbound email/Slack (Mail Outbound)");
  registerCorrespondenceDraftCommands(outboundCorrespondence);
  const styleCmd = outboundCorrespondence
    .command("style")
    .description("Correspondence style tools");
  styleCmd
    .command("lint")
    .description("Lint draft body against style contract")
    .requiredOption("--id <draftId>", "Draft ID")
    .option("--json", "JSON output")
    .action((opts) => runCorrespondenceStyleLint({ id: opts.id, json: opts.json }));

  outboundCmd
    .command("compose")
    .description("LLM reply draft from verified facts (never sends)")
    .requiredOption("--mail-id <id>", "Triage entry MSG-...")
    .option("--case <id>", "INQ- / DEAL- case id")
    .option("--to <email>", "Override recipient")
    .option("--contact-ref <id>", "external-contacts ref")
    .option("--operator <id>", "Created-by operator")
    .option("--no-approval", "Skip approval proposal")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runCorrespondenceCompose({
        mailId: opts.mailId,
        caseId: opts.case,
        to: opts.to,
        contactRef: opts.contactRef,
        operator: opts.operator,
        noApproval: opts.noApproval,
        json: opts.json,
      })
    );

  const knowledgeCmd = outboundCmd
    .command("knowledge")
    .description("L0–L1 knowledge search for compose");
  knowledgeCmd
    .command("search")
    .description("Search allowlisted product/sales docs")
    .requiredOption("--query <text>", "Search query")
    .option("--limit <n>", "Max hits", "8")
    .option("--json", "JSON output")
    .action((opts) =>
      runCorrespondenceKnowledgeSearch({
        query: opts.query,
        limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
        json: opts.json,
      })
    );

  const factsCmd = outboundCmd.command("facts").description("Fact verification for compose");
  factsCmd
    .command("verify")
    .description("Build verified claims pack")
    .option("--mail-id <id>", "Triage MSG-...")
    .option("--case <id>", "INQ- / DEAL- / SCH-")
    .option("--query <text>", "Knowledge query override")
    .option("--json", "JSON output")
    .action((opts) =>
      runCorrespondenceFactsVerify({
        mailId: opts.mailId,
        caseId: opts.case,
        query: opts.query,
        json: opts.json,
      })
    );

  const outboundMail = outboundCmd.command("mail").description("Mail config · archive");
  registerMailArchiveCommands(outboundMail, "List correspondence mail archive");
}
