/** Mail intake — Gmail thread history CLI. */
export async function runMailIntakeThreadShow(opts: {
  id: string;
  fetch?: boolean;
  dryRun?: boolean;
  json?: boolean;
}): Promise<void> {
  const { resolveGmailThreadId, listTriageEntriesForGmailThread, fetchGmailThreadHistory } =
    await import("../lib/correspondence/gmail-thread-fetch.js");

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
