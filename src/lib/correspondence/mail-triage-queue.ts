import { existsSync } from "node:fs";
import {
  mailTriageQueueSchema,
  type MailTriageEntry,
  type MailTriageQueue,
} from "../../../schemas/correspondence/mail-triage.js";
import { loadRegistryFile, readYamlFile, writeYamlFile } from "../utils.js";
import { getMailTriageQueueExamplePath, getMailTriageQueuePath } from "./paths.js";

export function loadMailTriageQueue(): MailTriageQueue {
  const path = getMailTriageQueuePath();
  return loadRegistryFile(path, mailTriageQueueSchema, () =>
    mailTriageQueueSchema.parse({ version: 1, entries: [] })
  );
}

export function saveMailTriageQueue(queue: MailTriageQueue): void {
  writeYamlFile(getMailTriageQueuePath(), mailTriageQueueSchema.parse(queue));
}

export function findTriageEntry(id: string): MailTriageEntry | undefined {
  return loadMailTriageQueue().entries.find((e) => e.id === id);
}

export function upsertTriageEntry(entry: MailTriageEntry): MailTriageEntry {
  const queue = loadMailTriageQueue();
  const idx = queue.entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    queue.entries[idx] = entry;
  } else {
    queue.entries.unshift(entry);
  }
  saveMailTriageQueue(queue);
  return entry;
}

export function listTriageEntries(opts?: {
  handoffStatus?: MailTriageEntry["handoff_status"];
  unprocessed?: boolean;
  limit?: number;
}): MailTriageEntry[] {
  let entries = loadMailTriageQueue().entries;
  if (opts?.handoffStatus) {
    entries = entries.filter((e) => e.handoff_status === opts.handoffStatus);
  }
  if (opts?.unprocessed) {
    entries = entries.filter((e) => !e.triaged_at);
  }
  const limit = opts?.limit ?? 100;
  return entries.slice(0, limit);
}

export function ensureMailTriageQueueExample(): string {
  const path = getMailTriageQueueExamplePath();
  if (existsSync(path)) return path;
  writeYamlFile(path, mailTriageQueueSchema.parse({ version: 1, entries: [] }));
  return path;
}

export function countHighPriorityTriage(): { pending: number; actionRequired: number } {
  const entries = loadMailTriageQueue().entries.filter(
    (e) => e.handoff_status === "pending" && e.disposition !== "spam"
  );
  const actionRequired = entries.filter(
    (e) =>
      e.importance === "p0" ||
      e.importance === "p1" ||
      e.urgency === "immediate" ||
      e.urgency === "today"
  ).length;
  return { pending: entries.length, actionRequired };
}

export function isHighPriorityEntry(entry: MailTriageEntry): boolean {
  if (entry.disposition === "spam") return false;
  return (
    entry.importance === "p0" ||
    entry.importance === "p1" ||
    entry.urgency === "immediate" ||
    entry.urgency === "today"
  );
}
