import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

export function digest(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function syncPath(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function durableWrite(path: string, bytes: string | Buffer): void {
  writeFileSync(path, bytes, { mode: 0o600 });
  syncPath(path);
}
type AuditInput = {
  event: "started" | "completed" | "failed";
  transaction_id: string;
  attempt_id: string;
  operator_id: string;
  reason: string;
  mode: "restore" | "committed_cleanup";
};
type AuditEntry = AuditInput & {
  version: 1;
  event_id: string;
  sequence: number;
  at: string;
  previous_hash: string;
  hash: string;
};

/** Atomic events avoid torn JSONL tails. The old JSONL is preserved and anchored. */
export function readRecoveryAudit(dir: string): AuditEntry[] {
  const auditDir = join(dir, ".reconciliation-recovery-audit");
  const legacy = join(dir, "reconciliation-recovery-audit.jsonl");
  let previous = existsSync(legacy) ? digest(readFileSync(legacy)) : digest("");
  if (!existsSync(auditDir)) return [];
  const records: AuditEntry[] = [];
  for (const name of readdirSync(auditDir)
    .filter((n) => !n.endsWith(".tmp"))
    .sort()) {
    const entry = JSON.parse(readFileSync(join(auditDir, name), "utf8")) as AuditEntry;
    const { hash, ...body } = entry;
    if (
      entry.version !== 1 ||
      entry.sequence !== records.length + 1 ||
      entry.previous_hash !== previous ||
      digest(JSON.stringify(body)) !== hash ||
      name !== `${String(entry.sequence).padStart(10, "0")}-${entry.event_id}.json` ||
      !["started", "completed", "failed"].includes(entry.event)
    )
      throw new Error("Reconciliation recovery audit chain is invalid");
    records.push(entry);
    previous = hash;
  }
  return records;
}

/** Caller holds the finance lock. Completion follows durable ledger verification. */
export function appendRecoveryAudit(dir: string, input: AuditInput): void {
  const records = readRecoveryAudit(dir);
  const legacy = join(dir, "reconciliation-recovery-audit.jsonl");
  const body = {
    version: 1 as const,
    ...input,
    event_id: randomUUID(),
    sequence: records.length + 1,
    at: new Date().toISOString(),
    previous_hash:
      records.at(-1)?.hash ?? (existsSync(legacy) ? digest(readFileSync(legacy)) : digest("")),
  };
  const auditDir = join(dir, ".reconciliation-recovery-audit");
  mkdirSync(auditDir, { recursive: true, mode: 0o700 });
  const path = join(auditDir, `${String(body.sequence).padStart(10, "0")}-${body.event_id}.json`);
  durableWrite(`${path}.tmp`, JSON.stringify({ ...body, hash: digest(JSON.stringify(body)) }));
  renameSync(`${path}.tmp`, path);
  syncPath(auditDir);
  syncPath(dir);
}
