import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  periodLockEntrySchema,
  periodLocksFileSchema,
  type PeriodLockEntry,
  type PeriodLocksFile,
} from "../../../schemas/finance/period-lock.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";
import { writeYamlFileAtomic } from "../yaml-atomic.js";
import { findOperatorById } from "../org/operators.js";
import { operatorHasPermission } from "../console-auth/operator-rbac.js";
import { assertHumanApprovalContext } from "../org/human-approval-context.js";
import type { HumanApprovalContext } from "../../../schemas/org/human-approval-context.js";
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import { createCompanyEvent, listCompanyEvents } from "../company-events.js";

const REL = "finance/period-locks.yaml";

function eventDigest(entry: Omit<PeriodLockEntry, "event_sha256">): string {
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

function chainedEntry(
  input: Omit<PeriodLockEntry, "sequence" | "previous_event_sha256" | "event_sha256">,
  history: PeriodLockEntry[],
): PeriodLockEntry {
  const previous = [...history].reverse().find((row) => row.month === input.month);
  const priorForDigest = previous
    ? Object.fromEntries(Object.entries(previous).filter(([key]) => key !== "event_sha256")) as Omit<PeriodLockEntry, "event_sha256">
    : undefined;
  const base: Omit<PeriodLockEntry, "event_sha256"> = {
    ...input,
    sequence: history.filter((row) => row.month === input.month).length + 1,
    ...(previous
      ? { previous_event_sha256: previous.event_sha256 ?? eventDigest(priorForDigest!) }
      : {}),
  };
  return periodLockEntrySchema.parse({ ...base, event_sha256: eventDigest(base) });
}

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
  const previous = existsSync(path()) ? readYamlFile(path(), periodLocksFileSchema) : null;
  assertPeriodLocksAppendOnly(file, previous);
  const parsed = periodLocksFileSchema.parse(file);
  const issues = periodLockIntegrityIssuesForFile(parsed);
  if (issues.length > 0) throw new Error(`period lock integrity failed: ${issues.join("; ")}`);
  writeYamlFileAtomic(path(), parsed);
}

/** Past lock rows are immutable; only append new lock/unlock records. */
export function assertPeriodLocksAppendOnly(
  next: PeriodLocksFile,
  previous: PeriodLocksFile | null,
): void {
  if (!previous) return;
  if (next.locks.length < previous.locks.length) {
    throw new Error("period-locks.yaml is append-only: cannot remove historical lock rows");
  }
  for (let i = 0; i < previous.locks.length; i++) {
    const a = previous.locks[i]!;
    const b = next.locks[i]!;
    if (
      a.month !== b.month ||
      a.status !== b.status ||
      a.at !== b.at ||
      a.by !== b.by ||
      (a.reason ?? "") !== (b.reason ?? "") ||
      JSON.stringify(a.evidence ?? null) !== JSON.stringify(b.evidence ?? null)
      || a.sequence !== b.sequence
      || a.previous_event_sha256 !== b.previous_event_sha256
      || a.event_sha256 !== b.event_sha256
      || a.company_event_id !== b.company_event_id
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
  evidence?: PeriodLockEntry["evidence"];
}): PeriodLockEntry {
  const file = loadPeriodLocks();
  const integrityIssues = periodLockIntegrityIssuesForFile(file);
  if (integrityIssues.length > 0) throw new Error(`period lock integrity failed: ${integrityIssues.join("; ")}`);
  const latest = latestLockForMonth(input.month, file);
  if (latest?.status === "locked") return latest;
  const entry = chainedEntry(periodLockEntrySchema.omit({ sequence: true, previous_event_sha256: true, event_sha256: true }).parse({
    month: input.month,
    status: "locked",
    at: input.lockedAt ?? new Date().toISOString(),
    by: input.lockedBy,
    reason: input.reason,
    evidence: input.evidence,
  }), file.locks);
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
  const integrityIssues = periodLockIntegrityIssuesForFile(file);
  if (integrityIssues.length > 0) throw new Error(`period lock integrity failed: ${integrityIssues.join("; ")}`);
  const entry = chainedEntry(periodLockEntrySchema.omit({ sequence: true, previous_event_sha256: true, event_sha256: true }).parse({
    month: input.month,
    status: "unlocked",
    at: input.unlockedAt ?? new Date().toISOString(),
    by: input.unlockedBy,
    reason: input.reason,
  }), file.locks);
  file.locks.push(entry);
  savePeriodLocks(file);
  return entry;
}

export function legacyPeriodLockAttestationRef(month: string, entry = latestLockForMonth(month)): string {
  if (!entry || entry.status !== "locked") throw new Error(`Legacy period ${month} is not locked`);
  const canonical = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "event_sha256"));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Re-attest legacy rows through the same human authority boundary as other financial approvals. */
export function attestLegacyPeriodLock(input: {
  month: string;
  operatorId: string;
  reason: string;
  approval: OrgApprovalRequest;
  humanContext: HumanApprovalContext;
  attestedAt?: string;
}): PeriodLockEntry {
  if (!input.reason.trim()) throw new Error("Legacy period-lock attestation requires a reason");
  const file = loadPeriodLocks();
  const latest = latestLockForMonth(input.month, file);
  if (!latest || latest.status !== "locked") throw new Error(`Legacy period ${input.month} is not locked`);
  if (latest.sequence && latest.event_sha256) return latest;
  const subjectRef = legacyPeriodLockAttestationRef(input.month, latest);
  if (input.approval.subject_type !== "finance.period-lock-attestation" || input.approval.subject_ref !== subjectRef) {
    throw new Error("human approval is not bound to this legacy period lock");
  }
  const operator = findOperatorById(input.operatorId);
  if (!operatorHasPermission(operator, "finance:reconcile")) throw new Error("operator lacks finance:reconcile for period-lock attestation");
  assertHumanApprovalContext({ context: input.humanContext, approval: input.approval, operatorId: input.operatorId });
  const eventSlug = `period-lock-attestation-${input.month}`;
  const existingEvent = listCompanyEvents({ includeVoided: true }).find((event) =>
    event.notes?.includes(`legacy_lock_sha256=${subjectRef}`));
  const companyEventId = existingEvent?.id ?? createCompanyEvent({
    kind: "finance",
    title: `Period lock attestation ${input.month}`,
    slug: eventSlug,
    related: { application_id: input.approval.approval_id },
    notes: `month=${input.month}\nlegacy_lock_sha256=${subjectRef}\noperator_id=${input.operatorId}\napproval_id=${input.approval.approval_id}`,
  }).id;
  const entry = chainedEntry(periodLockEntrySchema.omit({ sequence: true, previous_event_sha256: true, event_sha256: true }).parse({
    month: input.month,
    status: "locked",
    at: input.attestedAt ?? new Date().toISOString(),
    by: input.operatorId,
    reason: `legacy-attestation: ${input.reason.trim()}`,
    evidence: latest.evidence,
    company_event_id: companyEventId,
  }), file.locks);
  file.locks.push(entry);
  savePeriodLocks(file);
  return entry;
}

export function periodLockIntegrityIssues(): string[] {
  return periodLockIntegrityIssuesForFile(loadPeriodLocks());
}

function periodLockIntegrityIssuesForFile(file: PeriodLocksFile): string[] {
  const issues: string[] = [];
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
  const previousByMonth = new Map<string, PeriodLockEntry>();
  const countByMonth = new Map<string, number>();
  for (const lock of file.locks) {
    const previous = previousByMonth.get(lock.month);
    const expectedSequence = (countByMonth.get(lock.month) ?? 0) + 1;
    if (lock.sequence != null) {
      if (lock.sequence !== expectedSequence) issues.push(`period lock ${lock.month}: invalid sequence`);
      const base = Object.fromEntries(Object.entries(lock).filter(([key]) => key !== "event_sha256")) as Omit<PeriodLockEntry, "event_sha256">;
      if (lock.event_sha256 !== eventDigest(base)) issues.push(`period lock ${lock.month}: event hash mismatch`);
      if (previous) {
        const priorBase = Object.fromEntries(Object.entries(previous).filter(([key]) => key !== "event_sha256")) as Omit<PeriodLockEntry, "event_sha256">;
        const expectedPrevious = previous.event_sha256 ?? eventDigest(priorBase);
        if (lock.previous_event_sha256 !== expectedPrevious) issues.push(`period lock ${lock.month}: previous event hash mismatch`);
      }
    }
    previousByMonth.set(lock.month, lock);
    countByMonth.set(lock.month, expectedSequence);
  }
  // Chronological append: each month's events must not go backwards in time.
  const lastAtByMonth = new Map<string, string>();
  for (const lock of file.locks) {
    const prev = lastAtByMonth.get(lock.month);
    if (prev && lock.at < prev) {
      issues.push(`period lock ${lock.month}: non-monotonic at (${prev} → ${lock.at})`);
    }
    lastAtByMonth.set(lock.month, lock.at);
  }
  return issues;
}

/** Test helper — bypasses append-only guard. */
export function resetPeriodLocksForTests(): void {
  writeYamlFile(path(), periodLocksFileSchema.parse({ version: 1, locks: [] }));
}
