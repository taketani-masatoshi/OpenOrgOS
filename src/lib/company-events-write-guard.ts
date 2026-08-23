/** Gate company-event ledger writes — only orgos events paths may persist YAML/JSONL/MD. */

let writeDepth = 0;
let currentSource = "";

export function isEventsWriteGuardDisabled(): boolean {
  return process.env.STEWARD_EVENTS_WRITE_GUARD === "off";
}

export function runWithEventsWriteGuard<T>(source: string, fn: () => T): T {
  if (isEventsWriteGuardDisabled()) {
    return fn();
  }
  writeDepth++;
  const prev = currentSource;
  currentSource = source;
  try {
    return fn();
  } finally {
    writeDepth--;
    currentSource = prev;
  }
}

export function isCompanyEventsProtectedPath(path: string): boolean {
  const n = path.replace(/\\/g, "/");
  return (
    n.endsWith("/company-events.yaml") ||
    n.endsWith("company-events.yaml") ||
    n.endsWith("/company-events-chain.jsonl") ||
    n.endsWith("company-events-chain.jsonl") ||
    /\/docs\/company\/events\/\d{4}-\d{2}\/EVT-/.test(n)
  );
}

export function assertEventsWriteAuthorized(path?: string): void {
  if (isEventsWriteGuardDisabled()) return;
  if (path && !isCompanyEventsProtectedPath(path)) return;
  if (writeDepth <= 0) {
    throw new Error(
      "Company events write rejected — use `orgos events` (direct ledger file writes are blocked). Do not recover with `events chain backfill --force`.",
    );
  }
}

export function currentEventsWriteSource(): string {
  return currentSource;
}
