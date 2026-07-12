import { existsSync } from "node:fs";
import {
  senderIdentificationQueueSchema,
  type SenderIdentificationEntry,
  type SenderIdentificationQueue,
} from "../../../schemas/correspondence/sender-identification.js";
import { loadRegistryFile, writeYamlFile } from "../utils.js";
import { join } from "node:path";
import { getDataDir } from "../utils.js";

export function getSenderIdentificationQueuePath(): string {
  return join(getDataDir(), "executive", "sender-identification-queue.yaml");
}

export function loadSenderIdentificationQueue(): SenderIdentificationQueue {
  return loadRegistryFile(getSenderIdentificationQueuePath(), senderIdentificationQueueSchema, () =>
    senderIdentificationQueueSchema.parse({ version: 1, entries: [] })
  );
}

export function saveSenderIdentificationQueue(queue: SenderIdentificationQueue): void {
  writeYamlFile(getSenderIdentificationQueuePath(), senderIdentificationQueueSchema.parse(queue));
}

export function findSenderIdentification(mailId: string): SenderIdentificationEntry | undefined {
  return loadSenderIdentificationQueue().entries.find((e) => e.mail_id === mailId);
}

export function upsertSenderIdentification(
  entry: SenderIdentificationEntry
): SenderIdentificationEntry {
  const queue = loadSenderIdentificationQueue();
  const idx = queue.entries.findIndex((e) => e.mail_id === entry.mail_id);
  const next = { ...entry, updated_at: new Date().toISOString() };
  if (idx >= 0) queue.entries[idx] = next;
  else queue.entries.unshift(next);
  saveSenderIdentificationQueue(queue);
  return next;
}

export function listPendingCeoIdentification(): SenderIdentificationEntry[] {
  return loadSenderIdentificationQueue().entries.filter((e) => e.status === "pending_ceo");
}

export function ensureSenderIdentificationExample(): string {
  const path = join(getDataDir(), "executive", "sender-identification-queue.yaml.example");
  if (existsSync(path)) return path;
  writeYamlFile(path, senderIdentificationQueueSchema.parse({ version: 1, entries: [] }));
  return path;
}
