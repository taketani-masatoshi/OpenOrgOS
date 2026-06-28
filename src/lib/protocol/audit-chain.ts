import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  protocolAuditRecordSchema,
  type ProtocolAuditRecord,
} from "../../../schemas/protocol/audit-record.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { appendJsonl, loadJsonl } from "../jsonl-store.js";
import { envelopeDigest } from "./canonical.js";
import { getProtocolAuditChainPath } from "./paths.js";
import { serializeEventEnvelope } from "./envelope.js";
import { assertProtocolWriteAuthorized, currentProtocolWriteSource } from "./protocol-write-guard.js";
import { writeOutboxProvenance } from "./outbox-provenance.js";

function generateAuditId(): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `PAUD-${Date.now()}-${suffix}`;
}

export function loadProtocolAuditChain(): ProtocolAuditRecord[] {
  return loadJsonl(getProtocolAuditChainPath(), (raw) => protocolAuditRecordSchema.parse(raw));
}

export function appendProtocolAuditRecord(options: {
  envelope: EventEnvelope;
  transactionId?: string;
}): ProtocolAuditRecord {
  mkdirSync(join(getProtocolAuditChainPath(), ".."), { recursive: true });
  const chain = loadProtocolAuditChain();
  const prev = chain.length > 0 ? chain[chain.length - 1] : undefined;
  const record = protocolAuditRecordSchema.parse({
    audit_id: generateAuditId(),
    event_id: options.envelope.event_id,
    transaction_id: options.transactionId,
    prev_audit_id: prev?.audit_id,
    digest: envelopeDigest(options.envelope),
    recorded_at: new Date().toISOString(),
  });
  appendJsonl(getProtocolAuditChainPath(), record);
  return record;
}

export interface AuditVerifyIssue {
  audit_id: string;
  message: string;
}

export function verifyProtocolAuditChainRecords(
  chain: ProtocolAuditRecord[],
  options?: {
    since?: string;
    envelopesByEventId?: Map<string, EventEnvelope>;
  }
): { ok: boolean; issues: AuditVerifyIssue[]; checked: number } {
  const issues: AuditVerifyIssue[] = [];
  let prevId: string | undefined;
  let checked = 0;

  for (const record of chain) {
    if (options?.since && record.recorded_at.slice(0, 10) < options.since) continue;
    checked++;

    if (record.prev_audit_id !== prevId) {
      issues.push({
        audit_id: record.audit_id,
        message: `prev_audit_id mismatch: expected ${prevId ?? "(none)"}, got ${record.prev_audit_id ?? "(none)"}`,
      });
    }

    const envelope = options?.envelopesByEventId?.get(record.event_id);
    if (envelope) {
      const expected = envelopeDigest(envelope);
      if (record.digest !== expected) {
        issues.push({
          audit_id: record.audit_id,
          message: `digest mismatch for event ${record.event_id}`,
        });
      }
    }

    prevId = record.audit_id;
  }

  return { ok: issues.length === 0, issues, checked };
}

export function verifyProtocolAuditChain(options?: {
  since?: string;
  envelopesByEventId?: Map<string, EventEnvelope>;
  chainPath?: string;
}): { ok: boolean; issues: AuditVerifyIssue[]; checked: number } {
  const chain = options?.chainPath
    ? loadJsonl(options.chainPath, (raw) => protocolAuditRecordSchema.parse(raw))
    : loadProtocolAuditChain();
  return verifyProtocolAuditChainRecords(chain, options);
}

export function writeOutboxEnvelope(envelope: EventEnvelope, outboxDir: string): string {
  assertProtocolWriteAuthorized();
  mkdirSync(outboxDir, { recursive: true });
  const path = join(outboxDir, `${envelope.event_id}.json`);
  writeFileSync(path, serializeEventEnvelope(envelope), "utf-8");
  writeOutboxProvenance(outboxDir, envelope, currentProtocolWriteSource() || "protocol");
  return path;
}
