import { syncMailReceive } from "../lib/correspondence/mail-receive-sync.js";
import { createMailReceivePoller } from "../lib/correspondence/mail-receive-poller.js";
import { loadMailReceiveState } from "../lib/correspondence/mail-receive-state.js";
import {
  loadMailTriageQueue,
  countHighPriorityTriage,
} from "../lib/correspondence/mail-triage-queue.js";
import { triageUnprocessedMail, overrideTriageEntry } from "../lib/correspondence/mail-triage.js";
import { writeInboundHandoffDraft, notifyMailTriageHighPriority } from "../lib/correspondence/mail-handoff.js";
import { upsertTriageEntry, findTriageEntry } from "../lib/correspondence/mail-triage-queue.js";
import { loadMailConfig, shouldAutoWireScan } from "../lib/correspondence/mail-config.js";
import { runGmailSetupWizard } from "../lib/correspondence/gmail-setup-wizard.js";
import {
  buildGmailAuthorizeUrl,
  completeGmailOAuthWithCode,
  getGmailOAuthTokenPath,
  runGmailOAuthCallbackServer,
} from "../lib/correspondence/gmail-oauth.js";
import {
  identifySenderForTriageEntry,
  confirmSenderFromCeo,
  registerConfirmedSender,
  listSenderIdentificationPending,
  formatSenderIdentificationReport,
} from "../lib/correspondence/sender-identification.js";
import { findSenderIdentification, loadSenderIdentificationQueue } from "../lib/correspondence/sender-identification-queue.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";
import {
  listPendingCeoInlineQuestions,
  loadCeoInlineQueue,
  findCeoInlineQuestion,
  answerCeoInline,
  formatCeoInlineQuestionDetail,
  applyCeoInlineAnswerSideEffects,
} from "../lib/correspondence/ceo-inline-question.js";
import { postTriageInterpretAndCeoAsk } from "../lib/correspondence/mail-triage-interpret.js";
import { interpretMailFromTriageEntry, findMailInterpretation } from "../lib/correspondence/mail-interpretation.js";
import { getTenantId } from "../lib/tenant.js";
import {
  buildCommunityMailConnectUrl,
  getCommunityUrl,
  resolveCommunityGmailBindForCli,
} from "../lib/protocol/community-gmail-bind.js";

/** `--field <fieldId> <value>` を argv から抽出（繰り返し可） */
export function parseCeoFieldArgs(argv: readonly string[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (let i = 0; i < argv.length - 2; i++) {
    if (argv[i] === "--field") {
      answers[argv[i + 1]!] = argv[i + 2]!;
      i += 2;
    }
  }
  return answers;
}

export async function runMailIntakeSync(opts: {
  watch?: boolean;
  dryRun?: boolean;
  json?: boolean;
}): Promise<void> {
  if (opts.watch) {
    const poller = createMailReceivePoller();
    if (opts.json) {
      console.log(JSON.stringify({ status: "watching", message: "Press Ctrl+C to stop" }));
    } else {
      console.log("Mail intake watcher started (Ctrl+C to stop)");
    }
    poller.start();
    await new Promise(() => {
      /* run until signal */
    });
    return;
  }

  const result = await syncMailReceive({ dryRun: opts.dryRun });
  const config = loadMailConfig();
  let triage = { processed: 0, highPriorityIds: [] as string[], notified: 0 };

  if (!opts.dryRun && result.fetched > 0 && config?.receive?.auto_triage !== false) {
    triage = await triageUnprocessedMail();
    if (config?.receive?.notify_high_priority !== false && triage.highPriorityIds.length) {
      triage.notified = await notifyMailTriageHighPriority(triage.highPriorityIds);
    }
  }

  let wireScan: { scanned: number; ingested: number; skipped: number } | undefined;
  if (!opts.dryRun && shouldAutoWireScan(config)) {
    const { scanMailReceivedForWire } = await import("../lib/protocol/email-wire-ingest.js");
    wireScan = await scanMailReceivedForWire({ sinceDays: 1 });
  }

  const payload = { sync: result, triage, wire_scan: wireScan };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Sync mode: ${result.mode} · fetched: ${result.fetched} · saved: ${result.saved.length}`);
  if (result.message) console.log(result.message);
  if (triage.processed) {
    console.log(`Triage processed: ${triage.processed} · notified: ${triage.notified}`);
  }
  if (wireScan) {
    console.log(
      `Wire scan: scanned ${wireScan.scanned} · ingested ${wireScan.ingested} · skipped ${wireScan.skipped}`
    );
  }
}

export async function runMailIntakeWireScan(opts: {
  sinceDays?: number;
  dryRun?: boolean;
  json?: boolean;
}): Promise<void> {
  const { scanMailReceivedForWire } = await import("../lib/protocol/email-wire-ingest.js");
  const result = await scanMailReceivedForWire({
    sinceDays: opts.sinceDays,
    dryRun: opts.dryRun,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `Wire scan: scanned ${result.scanned} · ingested ${result.ingested} · skipped ${result.skipped}`
  );
  for (const err of result.errors) {
    console.log(`  ✗ ${err.file}: ${err.reason}`);
  }
}

export function runMailIntakeList(opts: { json?: boolean; unprocessed?: boolean }): void {
  const queue = loadMailTriageQueue();
  const state = loadMailReceiveState();
  const counts = countHighPriorityTriage();

  let entries = queue.entries;
  if (opts.unprocessed) {
    entries = entries.filter((e) => e.handoff_status === "pending" && e.routing === "secretary");
  }

  const payload = { state, counts, entries };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Receive state: last_uid=${state.last_uid} · last_sync=${state.last_sync_at ?? "never"}`);
  console.log(`Triage pending: ${counts.pending} · action required: ${counts.actionRequired}`);
  for (const e of entries.slice(0, 30)) {
    console.log(
      `- ${e.id} [${e.importance}/${e.urgency}/${e.disposition}] ${e.subject} ← ${e.from}`
    );
  }
}

export async function runMailIntakeTriage(opts: {
  unprocessed?: boolean;
  json?: boolean;
  notify?: boolean;
}): Promise<void> {
  const result = await triageUnprocessedMail();
  const config = loadMailConfig();
  if (
    opts.notify !== false &&
    config?.receive?.notify_high_priority !== false &&
    result.highPriorityIds.length
  ) {
    result.notified = await notifyMailTriageHighPriority(result.highPriorityIds);
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Triage processed: ${result.processed} · high priority: ${result.highPriorityIds.length}`);
}

export function runMailIntakeHandoff(opts: {
  id: string;
  to?: string;
  json?: boolean;
}): void {
  const entry = findTriageEntry(opts.id);
  if (!entry) {
    console.error(`Triage entry not found: ${opts.id}`);
    process.exit(1);
  }
  if (entry.routing === "ignore" || entry.disposition === "spam") {
    console.error(`Entry ${opts.id} is ${entry.disposition}/${entry.routing} — handoff skipped`);
    process.exit(1);
  }

  const draftPath = writeInboundHandoffDraft(entry);
  const updated = upsertTriageEntry({
    ...entry,
    handoff_status: "handed_off",
    handoff_ref: draftPath,
  });

  const payload = {
    id: updated.id,
    handoff_to: opts.to ?? "mail_outbound",
    draft_path: draftPath,
    hint: "orgos route handoff --to mail_outbound --ref <draft_path>",
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`✓ Handoff draft: ${draftPath}`);
  console.log(`  Next: npm run orgos -- route handoff --to mail_outbound --ref ${draftPath}`);
}

export function runMailIntakeOverride(opts: {
  id: string;
  importance?: string;
  urgency?: string;
  disposition?: string;
  routing?: string;
  json?: boolean;
}): void {
  const patch: Record<string, string> = {};
  if (opts.importance) patch.importance = opts.importance;
  if (opts.urgency) patch.urgency = opts.urgency;
  if (opts.disposition) patch.disposition = opts.disposition;
  if (opts.routing) patch.routing = opts.routing;

  const updated = overrideTriageEntry(opts.id, patch as Parameters<typeof overrideTriageEntry>[1]);
  if (!updated) {
    console.error(`Entry not found: ${opts.id}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ Updated ${opts.id}`);
}

export function runMailIntakeStatus(opts: { json?: boolean }): void {
  const config = loadMailConfig();
  const state = loadMailReceiveState();
  const counts = countHighPriorityTriage();
  const payload = {
    receive: config?.receive,
    state,
    triage_counts: counts,
  };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`sync: ${config?.receive?.sync ?? "stub"} · triage_mode: ${config?.receive?.triage_mode ?? "rules"}`);
  console.log(`last sync: ${state.last_sync_at ?? "never"} · last_uid: ${state.last_uid}`);
  if (state.last_error) console.log(`last error: ${state.last_error}`);
  console.log(`pending triage: ${counts.pending} · action required: ${counts.actionRequired}`);
}

export async function runMailIntakeSenderIdentify(opts: {
  id: string;
  skipWebSearch?: boolean;
  skipCeoAsk?: boolean;
  dryRun?: boolean;
  json?: boolean;
}): Promise<void> {
  const entry = findTriageEntry(opts.id);
  if (!entry) {
    console.error(`Triage entry not found: ${opts.id}`);
    process.exit(1);
  }
  const result = await identifySenderForTriageEntry(entry, {
    skipWebSearch: opts.skipWebSearch,
    skipCeoAsk: opts.skipCeoAsk,
    dryRun: opts.dryRun,
  });
  const payload = result;
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`✓ Sender identification: ${result.action}`);
  if (result.identification) {
    console.log(formatSenderIdentificationReport(result.identification));
  }
}

export function runMailIntakeSenderList(opts: { pending?: boolean; json?: boolean }): void {
  const all = opts.pending
    ? listSenderIdentificationPending()
    : loadSenderIdentificationQueue().entries;
  if (opts.json) {
    console.log(JSON.stringify(all, null, 2));
    return;
  }
  if (!all.length) {
    console.log("（送信者特定キューなし）");
    return;
  }
  for (const e of all) {
    console.log(formatSenderIdentificationReport(e));
    console.log("---");
  }
}

export function runMailIntakeSenderConfirm(opts: {
  id: string;
  name: string;
  org?: string;
  department?: string;
  role?: string;
  relationship?: string;
  notes?: string;
  webSearchTrusted?: boolean;
  operator?: string;
  json?: boolean;
}): void {
  requireCliDataWrite({ command: "mail intake sender confirm", permission: "escalate:plan" });
  auditCliMutation("mail intake sender confirm", "confirm");
  const identification = confirmSenderFromCeo({
    mailId: opts.id,
    name: opts.name,
    org: opts.org,
    department: opts.department,
    role: opts.role,
    relationship: opts.relationship,
    notes: opts.notes,
    webSearchTrusted: opts.webSearchTrusted,
    confirmedBy: opts.operator,
  });
  if (opts.json) {
    console.log(JSON.stringify(identification, null, 2));
    return;
  }
  console.log(`✓ CEO 確認済み: ${opts.name}`);
  console.log(`  次: npm run orgos -- mail intake sender register --id ${opts.id}`);
}

export function runMailIntakeSenderRegister(opts: { id: string; json?: boolean }): void {
  requireCliDataWrite({ command: "mail intake sender register", permission: "escalate:plan" });
  auditCliMutation("mail intake sender register", "register");
  const result = registerConfirmedSender(opts.id);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ 登録完了: ${result.extId}`);
}

export function runMailIntakeSenderShow(opts: { id: string; json?: boolean }): void {
  const identification = findSenderIdentification(opts.id);
  if (!identification) {
    console.error(`Sender identification not found: ${opts.id}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(identification, null, 2));
    return;
  }
  console.log(formatSenderIdentificationReport(identification));
}

export function runMailIntakeCeoList(opts: { json?: boolean; pending?: boolean }): void {
  const questions = opts.pending === false
    ? loadCeoInlineQueue().questions
    : listPendingCeoInlineQuestions();
  if (opts.json) {
    console.log(JSON.stringify(questions, null, 2));
    return;
  }
  if (!questions.length) {
    console.log("（CEO インライン質問なし）");
    return;
  }
  for (const q of questions) {
    console.log(formatCeoInlineQuestionDetail(q));
    console.log("---");
  }
}

export function runMailIntakeCeoShow(opts: { id: string; json?: boolean }): void {
  const question = findCeoInlineQuestion(opts.id);
  if (!question) {
    console.error(`CEO inline question not found: ${opts.id}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(question, null, 2));
    return;
  }
  console.log(formatCeoInlineQuestionDetail(question));
}

export function runMailIntakeCeoAnswer(opts: {
  id: string;
  fields: Record<string, string>;
  operator?: string;
  json?: boolean;
}): void {
  requireCliDataWrite({ command: "mail intake ceo answer", permission: "escalate:plan" });
  auditCliMutation("mail intake ceo answer", "answer");
  const question = findCeoInlineQuestion(opts.id);
  if (!question) {
    console.error(`CEO inline question not found: ${opts.id}`);
    process.exit(1);
  }
  if (question.status !== "pending") {
    console.error(`Question ${opts.id} is already ${question.status}`);
    process.exit(1);
  }
  if (!Object.keys(opts.fields).length) {
    console.error("No --field answers provided");
    process.exit(1);
  }
  const updated = answerCeoInline(opts.id, opts.fields, opts.operator);
  applyCeoInlineAnswerSideEffects(updated);
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ CEO 回答記録: ${opts.id}`);
  console.log(formatCeoInlineQuestionDetail(updated));
}

export async function runMailIntakeInterpret(opts: {
  id?: string;
  json?: boolean;
}): Promise<void> {
  if (opts.id) {
    const entry = findTriageEntry(opts.id);
    if (!entry) {
      console.error(`Triage entry not found: ${opts.id}`);
      process.exit(1);
    }
    const interpretation =
      findMailInterpretation(entry.id) ?? (await interpretMailFromTriageEntry(entry));
    await postTriageInterpretAndCeoAsk(entry);
    const payload = { mail_id: entry.id, interpretation };
    if (opts.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (!interpretation) {
      console.log(`（解釈なし — LLM 未設定または ensemble 無効）: ${entry.id}`);
      return;
    }
    console.log(
      `✓ ${entry.id}: ${interpretation.intent} · agreement ${Math.round(interpretation.agreement * 100)}%`
    );
    console.log(`  ${interpretation.summary_l1}`);
    return;
  }

  const queue = loadMailTriageQueue();
  let processed = 0;
  for (const entry of queue.entries) {
    if (entry.disposition === "spam" || entry.routing === "ignore") continue;
    if (!entry.sender_known) continue;
    if (!(entry.importance === "p0" || entry.importance === "p1" || entry.routing === "secretary")) {
      continue;
    }
    await postTriageInterpretAndCeoAsk(entry);
    processed += 1;
  }
  const payload = { processed };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`Interpret processed: ${processed}`);
}

export async function runMailSetupGmailCommunityLink(opts: {
  json?: boolean;
  tenantId?: string;
  communityUrl?: string;
  ttlMinutes?: number;
}): Promise<void> {
  const tenantId = opts.tenantId?.trim() || getTenantId();
  const communityUrl = opts.communityUrl?.trim() || getCommunityUrl();

  try {
    const bind = await resolveCommunityGmailBindForCli(tenantId, {
      ttlMinutes: opts.ttlMinutes,
    });
    const connectUrl = buildCommunityMailConnectUrl(bind.tenant_id, bind.nonce, communityUrl);
    const payload = {
      ok: true,
      tenant_id: bind.tenant_id,
      nonce: bind.nonce,
      expires_at: bind.expires_at,
      remote: bind.remote,
      community_url: communityUrl,
      connect_url: connectUrl,
      hint: "Open the URL in a browser while logged into Community to connect Gmail.",
    };

    if (opts.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log("Community Gmail 連携 — bind nonce を発行しました。");
    console.log(`  tenant:  ${bind.tenant_id}`);
    console.log(`  expires: ${bind.expires_at}`);
    if (bind.remote) {
      console.log(`  bind:    remote (${process.env.ORGOS_STEWARD_PROTOCOL_URL})`);
    }
    console.log("");
    console.log("Community で Gmail を接続:");
    console.log(connectUrl);
    console.log("");
    console.log("Community ログイン後、上記 URL を開いて Gmail 同意を完了してください。");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}

export async function runMailSetupGmail(opts: {
  json?: boolean;
  from?: string;
  name?: string;
  nonInteractive?: boolean;
  noOpen?: boolean;
  port?: number;
  communityLink?: boolean;
  tenantId?: string;
  communityUrl?: string;
  ttlMinutes?: number;
}): Promise<void> {
  if (opts.communityLink) {
    await runMailSetupGmailCommunityLink({
      json: opts.json,
      tenantId: opts.tenantId,
      communityUrl: opts.communityUrl,
      ttlMinutes: opts.ttlMinutes,
    });
    return;
  }

  const result = await runGmailSetupWizard({
    json: opts.json,
    fromEmail: opts.from,
    fromName: opts.name,
    nonInteractive: opts.nonInteractive,
    noOpen: opts.noOpen,
    port: opts.port,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (!result.ok) {
    console.error(result.error ?? "Gmail setup failed");
    process.exit(1);
  }
  console.log(`✓ Gmail API 初期設定完了`);
  console.log(`  account: ${result.from_email}`);
  console.log(`  token:   ${result.token_path}`);
  console.log(`  config:  ${result.mail_config_path}`);
  console.log("");
  console.log("送信例:");
  console.log(`  ${result.next_command}`);
}

export async function runMailSetupGmailAuth(opts: {
  json?: boolean;
  code?: string;
  listen?: boolean;
  noOpen?: boolean;
  port?: number;
}): Promise<void> {
  const tokenPath = getGmailOAuthTokenPath();

  if (opts.code?.trim()) {
    const result = await completeGmailOAuthWithCode(opts.code.trim());
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
      return;
    }
    if (!result.ok) {
      console.error(result.error ?? "Gmail OAuth failed");
      process.exit(1);
    }
    console.log(`✓ Gmail OAuth token saved: ${tokenPath}`);
    if (result.email) console.log(`  account: ${result.email}`);
    return;
  }

  const authorizeUrl = buildGmailAuthorizeUrl();
  if (!authorizeUrl) {
    const payload = {
      ok: false,
      error: "Set ORGOS_GMAIL_CLIENT_ID and ORGOS_GMAIL_CLIENT_SECRET",
      token_path: tokenPath,
      env: ["ORGOS_GMAIL_CLIENT_ID", "ORGOS_GMAIL_CLIENT_SECRET", "ORGOS_GMAIL_REDIRECT_URI"],
    };
    if (opts.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error(payload.error);
    }
    process.exit(1);
  }

  if (opts.listen !== false) {
    if (!opts.json) {
      console.log("Gmail OAuth — waiting for browser consent on localhost…");
      console.log(`Token path: ${tokenPath}`);
      console.log("");
      console.log("If the browser does not open, visit:");
      console.log(authorizeUrl);
      console.log("");
    }
    const result = await runGmailOAuthCallbackServer({
      port: opts.port,
      openBrowser: !opts.noOpen,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
      return;
    }
    if (!result.ok) {
      console.error(result.error ?? "Gmail OAuth failed");
      process.exit(1);
    }
    console.log(`✓ Gmail OAuth token saved: ${tokenPath}`);
    if (result.email) console.log(`  account: ${result.email}`);
    return;
  }

  const payload = {
    ok: true,
    authorize_url: authorizeUrl,
    token_path: tokenPath,
    hint: "Re-run with default (listen) or --code <auth-code> after consent",
  };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log("Authorize URL:");
  console.log(authorizeUrl);
  console.log(`Token path: ${tokenPath}`);
}
