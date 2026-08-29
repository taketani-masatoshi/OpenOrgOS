import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  periodLockEntrySchema,
  periodLocksFileSchema,
  type PeriodLockEntry,
  type PeriodLocksFile,
} from "../../../schemas/finance/period-lock.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";

const REL = "finance/period-locks.yaml";

function path(): string {
  return join(getDataDir(), REL);
}

export function loadPeriodLocks(): PeriodLocksFile {
  const filePath = path();
  if (!existsSync(filePath)) {
    return periodLocksFileSchema.parse({ version: 1, locks: [] });
  }
  return readYamlFile(path(), periodLocksFileSchema);
}

export function savePeriodLocks(file: PeriodLocksFile): void {
  const previous = existsSync(path())
    ? readYamlFile(path(), periodLocksFileSchema)
    : null;
  assertPeriodLocksAppendOnly(file, previous);
  writeYamlFile(path(), periodLocksFileSchema.parse(file));
}

/** Past lock rows are immutable; only append new lock/unlock records. */
export function assertPeriodLocksAppendOnly(
  next: PeriodLocksFile,
  previous: PeriodLocksFile | null,
): void {
  if (!previous) return;
  if (next.locks.length < previous.locks.length) {
    throw new Error(
      "period-locks.yaml is append-only: cannot remove historical lock rows",
    );
  }
  for (let i = 0; i < previous.locks.length; i++) {
    const a = previous.locks[i]!;
    const b = next.locks[i]!;
    if (
      a.month !== b.month ||
      a.status !== b.status ||
      a.at !== b.at ||
      a.by !== b.by ||
      (a.reason ?? "") !== (b.reason ?? "")
    ) {
      throw new Error(
        `period-locks.yaml is append-only: historical row ${i} (${a.month}) was modified`,
      );
    }
  }
}

export function latestLockForMonth(
  month: string,
  file = loadPeriodLocks(),
): PeriodLockEntry | undefined {
  return [...file.locks].reverse().find((lock) => lock.month === month);
}

export function isMonthLocked(month: string): boolean {
  const latest = latestLockForMonth(month);
  return latest?.status === "locked";
}

export function assertMonthUnlockedForDate(isoDate: string): void {
  const month = isoDate.slice(0, 7);
  if (isMonthLocked(month)) {
    throw new Error(`Accounting period ${month} is locked — post reversal or request unlock`);
  }
}

export function lockMonth(input: {
  month: string;
  lockedBy: string;
  reason?: string;
  lockedAt?: string;
}): PeriodLockEntry {
  const file = loadPeriodLocks();
  const latest = latestLockForMonth(input.month, file);
  if (latest?.status === "locked") return latest;
  const entry = periodLockEntrySchema.parse({
    month: input.month,
    status: "locked",
    at: input.lockedAt ?? new Date().toISOString(),
    by: input.lockedBy,
    reason: input.reason,
  });
  file.locks.push(entry);
  savePeriodLocks(file);
  return entry;
}

export function unlockMonth(input: {
  month: string;
  unlockedBy: string;
  reason?: string;
  unlockedAt?: string;
}): PeriodLockEntry | null {
  if (!isMonthLocked(input.month)) return null;
  if (!input.reason?.trim()) {
    throw new Error("Period unlock requires a reason");
  }
  const file = loadPeriodLocks();
  const entry = periodLockEntrySchema.parse({
    month: input.month,
    status: "unlocked",
    at: input.unlockedAt ?? new Date().toISOString(),
    by: input.unlockedBy,
    reason: input.reason,
  });
  file.locks.push(entry);
  savePeriodLocks(file);
  return entry;
}

export function periodLockIntegrityIssues(): string[] {
  const issues: string[] = [];
  const file = loadPeriodLocks();
  for (const lock of file.locks) {
    if (!lock.by) {
      issues.push(`period lock ${lock.month} (${lock.status}): missing actor`);
    }
    if (lock.status === "unlocked" && !lock.reason) {
      issues.push(`period unlock ${lock.month}: missing reason`);
    }
    if (!lock.at) {
      issues.push(`period lock ${lock.month}: missing at timestamp`);
    }
  }
  // Chronological append: each month's events must not go backwards in time.
  const lastAtByMonth = new Map<string, string>();
  for (const lock of file.locks) {
    const prev = lastAtByMonth.get(lock.month);
    if (prev && lock.at < prev) {
      issues.push(
        `period lock ${lock.month}: non-monotonic at (${prev} → ${lock.at})`,
      );
    }
    lastAtByMonth.set(lock.month, lock.at);
  }
  return issues;
}

/** Test helper — bypasses append-only guard. */
export function resetPeriodLocksForTests(): void {
  writeYamlFile(path(), periodLocksFileSchema.parse({ version: 1, locks: [] }));
}
