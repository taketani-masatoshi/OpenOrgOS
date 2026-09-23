/** Mail intake — receive · triage · handoff · status. */
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
import { getCorrespondenceHooks } from "../lib/correspondence/hooks.js";
/** Side-effect: register scheduling binders for getCorrespondenceHooks(). */
import "../lib/scheduling-coordination/bind-correspondence-hooks.js";

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
export { runMailIntakeInterpret } from "./mail-intake-interpret.js";
export { runMailIntakeThreadShow } from "./mail-intake-thread.js";

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

  console.log(
    `Sync mode: ${result.mode} · fetched: ${result.fetched} · saved: ${result.saved.length}`
  );
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

  console.log(
    `Receive state: last_uid=${state.last_uid} · last_sync=${state.last_sync_at ?? "never"}`
  );
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

export function runMailIntakeHandoff(opts: { id: string; to?: string; json?: boolean }): void {
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
