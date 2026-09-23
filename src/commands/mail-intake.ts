/** Mail intake — receive · triage · handoff · interpret · thread. */
import { syncMailReceive } from "../lib/correspondence/mail-receive-sync.js";
import { createMailReceivePoller } from "../lib/correspondence/mail-receive-poller.js";
import { loadMailReceiveState } from "../lib/correspondence/mail-receive-state.js";
import {
  loadMailTriageQueue,
  countHighPriorityTriage,
  upsertTriageEntry,
  findTriageEntry,
} from "../lib/correspondence/mail-triage-queue.js";
import { triageUnprocessedMail, overrideTriageEntry } from "../lib/correspondence/mail-triage.js";
import {
  writeInboundHandoffDraft,
  notifyMailTriageHighPriority,
} from "../lib/correspondence/mail-handoff.js";
import { loadMailConfig, shouldAutoWireScan } from "../lib/correspondence/mail-config.js";
import { postTriageInterpretAndCeoAsk } from "../lib/correspondence/mail-triage-interpret.js";
import {
  interpretMailFromTriageEntry,
  findMailInterpretation,
} from "../lib/correspondence/mail-interpretation.js";
import { getCorrespondenceHooks } from "../lib/correspondence/hooks.js";
import { ensureSchedulingCorrespondenceHooks } from "../lib/scheduling-coordination/bind-correspondence-hooks.js";

export {
  parseCeoFieldArgs,
  runMailIntakeCeoList,
  runMailIntakeCeoShow,
  runMailIntakeCeoAnswer,
} from "./mail-intake-ceo.js";
export {
  runMailIntakeSenderIdentify,
  runMailIntakeSenderList,
  runMailIntakeSenderConfirm,
  runMailIntakeSenderRegister,
  runMailIntakeSenderShow,
} from "./mail-intake-sender.js";

export async function runMailIntakeSync(opts: {
  watch?: boolean;
  dryRun?: boolean;
  json?: boolean;
}): Promise<void> {
  ensureSchedulingCorrespondenceHooks();
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

  if (!opts.dryRun) {
    await getCorrespondenceHooks().afterMailReceiveCycle?.({
      fetched: result.fetched,
      autoScheduleCoordination:
        result.fetched > 0 && config?.receive?.auto_schedule_coordination !== false,
      now: new Date(),
    });
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
  console.log(
    `Triage processed: ${result.processed} · high priority: ${result.highPriorityIds.length}`
  );
}

export function runMailIntakeHandoff(opts: {
  id: string;
  to?: string;
  json?: boolean;
}): void {
  ensureSchedulingCorrespondenceHooks();
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
  console.log(
    `sync: ${config?.receive?.sync ?? "stub"} · triage_mode: ${config?.receive?.triage_mode ?? "rules"}`
  );
  console.log(`last sync: ${state.last_sync_at ?? "never"} · last_uid: ${state.last_uid}`);
  if (state.last_error) console.log(`last error: ${state.last_error}`);
  console.log(`pending triage: ${counts.pending} · action required: ${counts.actionRequired}`);
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

export async function runMailIntakeThreadShow(opts: {
  id: string;
  fetch?: boolean;
  dryRun?: boolean;
  json?: boolean;
}): Promise<void> {
  const {
    resolveGmailThreadId,
    listTriageEntriesForGmailThread,
    fetchGmailThreadHistory,
  } = await import("../lib/correspondence/gmail-thread-fetch.js");

  const threadId = resolveGmailThreadId(opts.id);
  if (!threadId) {
    console.error(`Could not resolve Gmail thread id from ${opts.id}`);
    process.exit(1);
  }

  let fetchResult: Awaited<ReturnType<typeof fetchGmailThreadHistory>> | undefined;
  if (opts.fetch) {
    try {
      fetchResult = await fetchGmailThreadHistory({
        threadId,
        dryRun: opts.dryRun,
      });
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  }

  const entries = listTriageEntriesForGmailThread(threadId);
  const payload = {
    thread_id: threadId,
    triage_entries: entries.map((e) => ({
      id: e.id,
      subject: e.subject,
      from: e.from,
      received_at: e.received_at,
      eml_ref: e.eml_ref,
    })),
    fetch: fetchResult,
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`Gmail thread: ${threadId}`);
  if (fetchResult) {
    console.log(`  fetched: ${fetchResult.fetched} · saved: ${fetchResult.saved.length}`);
  }
  for (const e of entries) {
    console.log(`  ${e.id} · ${e.received_at.slice(0, 10)} · ${e.subject}`);
  }
  if (!entries.length && !fetchResult) {
    console.log("  (no local triage entries — try --fetch)");
  }
}
