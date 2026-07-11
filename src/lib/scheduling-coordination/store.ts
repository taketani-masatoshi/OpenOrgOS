import { existsSync } from "node:fs";
import {
  schedulingCasesFileSchema,
  schedulingCaseSchema,
  type SchedulingCase,
  type SchedulingCasesFile,
  type SchedulingParticipant,
  type SchedulingProposedSlot,
} from "../../../schemas/executive/scheduling-cases.js";
import { loadRegistryFile, writeYamlFile } from "../utils.js";
import { getSchedulingCasesPath } from "./paths.js";

export function loadSchedulingCases(): SchedulingCasesFile {
  return loadRegistryFile(getSchedulingCasesPath(), schedulingCasesFileSchema, () =>
    schedulingCasesFileSchema.parse({ version: 1, cases: [] })
  );
}

export function saveSchedulingCases(file: SchedulingCasesFile): void {
  writeYamlFile(getSchedulingCasesPath(), schedulingCasesFileSchema.parse(file));
}

export function findSchedulingCase(id: string): SchedulingCase | undefined {
  return loadSchedulingCases().cases.find((c) => c.id === id);
}

export function insertSchedulingCase(caseRow: SchedulingCase): SchedulingCase {
  const file = loadSchedulingCases();
  if (file.cases.some((c) => c.id === caseRow.id)) {
    throw new Error(
      `Scheduling case ${caseRow.id} already exists — use updateSchedulingCase for mutations`
    );
  }
  const parsed = schedulingCaseSchema.parse({ ...caseRow, revision: 0 });
  file.cases.unshift(parsed);
  saveSchedulingCases(file);
  return parsed;
}

export function upsertSchedulingCase(caseRow: SchedulingCase): SchedulingCase {
  const existing = findSchedulingCase(caseRow.id);
  if (!existing) return insertSchedulingCase(caseRow);
  if (caseRow.revision !== existing.revision) {
    throw new SchedulingRevisionConflictError(
      caseRow.id,
      caseRow.revision,
      existing.revision
    );
  }
  return updateSchedulingCase(existing.id, existing.revision, () => caseRow);
}

export class SchedulingRevisionConflictError extends Error {
  constructor(
    readonly caseId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number
  ) {
    super(
      `Scheduling case ${caseId} revision conflict: expected ${expectedRevision}, actual ${actualRevision}`
    );
    this.name = "SchedulingRevisionConflictError";
  }
}

/**
 * Read-check-write in one synchronous critical section. Callers must pass the
 * revision they read; a stale worker cannot overwrite a newer mail/calendar update.
 */
export function updateSchedulingCase(
  id: string,
  expectedRevision: number,
  update: (current: SchedulingCase) => SchedulingCase
): SchedulingCase {
  const file = loadSchedulingCases();
  const idx = file.cases.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error(`Scheduling case ${id} not found`);
  const current = file.cases[idx]!;
  if (current.revision !== expectedRevision) {
    throw new SchedulingRevisionConflictError(id, expectedRevision, current.revision);
  }
  const updated = schedulingCaseSchema.parse({
    ...update(current),
    id: current.id,
    revision: current.revision + 1,
  });
  file.cases[idx] = updated;
  saveSchedulingCases(file);
  return updated;
}

export function listSchedulingCases(opts?: {
  status?: SchedulingCase["status"] | SchedulingCase["status"][];
  activeOnly?: boolean;
  limit?: number;
}): SchedulingCase[] {
  let cases = loadSchedulingCases().cases;
  if (opts?.activeOnly) {
    cases = cases.filter((c) => !["closed", "cancelled"].includes(c.status));
  }
  if (opts?.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    cases = cases.filter((c) => statuses.includes(c.status));
  }
  const limit = opts?.limit ?? 100;
  return cases.slice(0, limit);
}

export function nextSchedulingCaseId(cases: SchedulingCase[]): string {
  const year = new Date().getFullYear();
  const prefix = `SCH-${year}-`;
  let max = 0;
  for (const c of cases) {
    const m = c.id.match(/^SCH-\d{4}-(\d{3})$/);
    if (m && c.id.startsWith(prefix)) {
      max = Math.max(max, parseInt(m[1]!, 10));
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function nextParticipantId(participants: SchedulingParticipant[]): string {
  let max = 0;
  for (const p of participants) {
    const m = p.id.match(/^PART-(\d{3})$/);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `PART-${String(max + 1).padStart(3, "0")}`;
}

export function nextSlotId(slots: SchedulingProposedSlot[]): string {
  let max = 0;
  for (const s of slots) {
    const m = s.id.match(/^SLOT-(\d{3})$/);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `SLOT-${String(max + 1).padStart(3, "0")}`;
}

export function ensureSchedulingCasesFile(): boolean {
  return existsSync(getSchedulingCasesPath());
}

export function countActiveSchedulingCases(): number {
  return listSchedulingCases({ activeOnly: true }).length;
}

export function countSchedulingCasesNeedingAction(): number {
  return listSchedulingCases({ activeOnly: true }).filter((c) => c.next_action !== "none").length;
}
