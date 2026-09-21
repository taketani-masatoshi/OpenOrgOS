import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import {
  eltaxOfficialPackageSchema,
  eltaxSubmissionRecordSchema,
  type EltaxOfficialPackage,
  type EltaxSubmissionRecord,
} from "../../../schemas/finance/eltax.js";
import { getClock, getIdGenerator } from "../runtime-context.js";
import { withYamlFileLock } from "../yaml-atomic.js";

export interface EltaxTransport {
  readonly channel: "eltax";
  readonly name: string;
  readonly certified: boolean;
  send(input: { package: EltaxOfficialPackage; signaturePath: string; idempotencyKey: string; requestId: string }): Promise<{ requestId: string; status: "received" | "accepted" | "rejected"; localReceiptNumber?: string }>;
  lookup?(input: { requestId: string; idempotencyKey: string }): Promise<{ status: "not_found" | "unknown" } | { status: "found"; result: "received" | "accepted" | "rejected"; localReceiptNumber?: string }>;
}

export interface EltaxSigner {
  readonly certified: boolean;
  sign(input: { payloadPath: string; payloadSha256: string }): Promise<{ algorithm: string; certificateFingerprintSha256: string; signaturePath: string }>;
}

const transitions: Record<EltaxSubmissionRecord["status"], EltaxSubmissionRecord["status"][]> = {
  prepared: ["approved", "cancelled"], approved: ["signed", "cancelled"], signed: ["sending", "cancelled"],
  sending: ["received", "accepted", "rejected", "signed"], received: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
  cancelled: [],
};

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

function assertSubmissionId(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || id.includes("..")) throw new Error("invalid eLTAX submission id");
  return id;
}

function atomicJsonWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

/** Local-tax submissions stay in their own directory and schema. This is not an eLTAX filing client. */
export class EltaxSubmissionStore {
  readonly production: boolean;
  readonly officialIntegrationReady: boolean;
  constructor(private readonly root: string, private readonly retentionYears = 10, security?: { production?: boolean; encryptedStorage?: boolean; officialIntegrationReady?: boolean }) {
    if (root.split(sep).includes("etax")) throw new Error("eLTAX state cannot use an e-Tax directory");
    this.production = security?.production === true;
    this.officialIntegrationReady = security?.officialIntegrationReady === true;
    if (this.production && !security?.encryptedStorage) throw new Error("production eLTAX state requires encrypted storage");
  }
  private path(id: string) { return join(this.root, `${assertSubmissionId(id)}.json`); }
  private locked<T>(fn: () => T): T {
    return withYamlFileLock(join(this.root, ".eltax-submission-store"), fn, { retries: 120, retryDelayMs: 25 });
  }
  create(pkg: unknown, idempotencyKey: string): EltaxSubmissionRecord {
    return this.locked(() => {
      if (pkg && typeof pkg === "object" && (pkg as { schema?: string }).schema === "orgos.jp.etax-official-package.v1") {
        throw new Error("e-Tax package cannot be stored as eLTAX");
      }
      const parsedPackage = eltaxOfficialPackageSchema.parse(pkg);
      mkdirSync(this.root, { recursive: true });
      const existing = this.list().find((row) => row.idempotency_key === idempotencyKey);
      if (existing) {
        if (existing.package.package_id !== parsedPackage.package_id) throw new Error("idempotency key reused for a different eLTAX package");
        return existing;
      }
      const now = getClock().nowIso();
      const retention = new Date(now); retention.setUTCFullYear(retention.getUTCFullYear() + this.retentionYears);
      const record = eltaxSubmissionRecordSchema.parse({
        schema: "orgos.jp.eltax-submission.v1", submission_id: getIdGenerator().uniqueId("ELTAX"), revision: 0,
        idempotency_key: idempotencyKey, status: "prepared", package: parsedPackage, attempts: [], retention_until: retention.toISOString().slice(0, 10), legal_hold: false, created_at: now, updated_at: now,
      });
      atomicJsonWrite(this.path(record.submission_id), record);
      this.appendAudit(record);
      return record;
    });
  }
  get(id: string): EltaxSubmissionRecord {
    return eltaxSubmissionRecordSchema.parse(JSON.parse(readFileSync(this.path(id), "utf8")));
  }
  list(): EltaxSubmissionRecord[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root).filter((name) => name.endsWith(".json")).map((name) =>
      eltaxSubmissionRecordSchema.parse(JSON.parse(readFileSync(join(this.root, name), "utf8"))));
  }
  transition(id: string, next: EltaxSubmissionRecord["status"], localReceiptNumber?: string): EltaxSubmissionRecord {
    return this.locked(() => {
      const record = this.get(id);
      if (!transitions[record.status].includes(next)) throw new Error(`invalid eLTAX transition: ${record.status} -> ${next}`);
      if (next === "accepted" && !localReceiptNumber) throw new Error("eLTAX acceptance requires a local receipt number");
      const parsed = eltaxSubmissionRecordSchema.parse({
        ...record, status: next, revision: record.revision + 1, updated_at: getClock().nowIso(),
        local_receipt_number: localReceiptNumber ?? record.local_receipt_number,
      });
      atomicJsonWrite(this.path(parsed.submission_id), parsed);
      this.appendAudit(parsed);
      return parsed;
    });
  }
  save(record: EltaxSubmissionRecord): EltaxSubmissionRecord {
    return this.locked(() => {
      const current = this.get(record.submission_id);
      if (current.revision !== record.revision) throw new Error("stale eLTAX submission revision");
      if (current.legal_hold && !record.legal_hold) throw new Error("eLTAX legal hold cannot be cleared");
      if (record.retention_until < current.retention_until) throw new Error("eLTAX retention cannot be shortened");
      const parsed = eltaxSubmissionRecordSchema.parse({ ...record, revision: record.revision + 1, updated_at: getClock().nowIso() });
      atomicJsonWrite(this.path(parsed.submission_id), parsed);
      this.appendAudit(parsed);
      return parsed;
    });
  }
  private appendAudit(record: EltaxSubmissionRecord): void {
    mkdirSync(this.root, { recursive: true });
    const auditPath = join(this.root, "audit.jsonl");
    const rows = existsSync(auditPath) ? readFileSync(auditPath, "utf8").trim().split("\n").filter(Boolean) : [];
    const previous = rows.length > 0 ? JSON.parse(rows.at(-1)!) as { row_sha256: string } : null;
    const base = { seq: rows.length + 1, prev_sha256: previous?.row_sha256 ?? "0".repeat(64), submission_id: record.submission_id, revision: record.revision, status: record.status, payload_sha256: record.package.payload_sha256, receipt: record.local_receipt_number ?? null };
    appendFileSync(auditPath, `${JSON.stringify({ ...base, row_sha256: sha256(JSON.stringify(base)) })}\n`, { encoding: "utf8", mode: 0o600 });
  }
  verifyAudit(): string[] {
    const auditPath = join(this.root, "audit.jsonl");
    if (!existsSync(auditPath)) return [];
    const issues: string[] = []; let previous = "0".repeat(64);
    for (const [index, line] of readFileSync(auditPath, "utf8").trim().split("\n").filter(Boolean).entries()) {
      const row = JSON.parse(line) as Record<string, unknown> & { prev_sha256: string; row_sha256: string };
      const { row_sha256, ...base } = row;
      if (row.prev_sha256 !== previous || row_sha256 !== sha256(JSON.stringify(base))) issues.push(`eLTAX audit chain mismatch at ${index + 1}`);
      previous = row_sha256;
    }
    return issues;
  }
}

export function approveEltaxSubmission(input: { store: EltaxSubmissionStore; submissionId: string; operatorId: string; authorize: (input: { operatorId: string; payloadSha256: string }) => boolean }): EltaxSubmissionRecord {
  const record = input.store.get(input.submissionId);
  if (record.status !== "prepared" || !input.authorize({ operatorId: input.operatorId, payloadSha256: record.package.payload_sha256 })) throw new Error("eLTAX approval denied");
  return input.store.save({ ...record, status: "approved", approval: { operator_id: input.operatorId, approved_at: getClock().nowIso(), payload_sha256: record.package.payload_sha256 } });
}

export async function signEltaxSubmission(input: { store: EltaxSubmissionStore; submissionId: string; signer: EltaxSigner }): Promise<EltaxSubmissionRecord> {
  const record = input.store.get(input.submissionId);
  if (record.status !== "approved" || !record.approval || !input.signer.certified) throw new Error("eLTAX submission requires approval and a certified signer");
  const payload = readFileSync(record.package.payload_path);
  if (sha256(payload) !== record.package.payload_sha256 || record.approval.payload_sha256 !== record.package.payload_sha256) throw new Error("eLTAX approved payload changed");
  const signed = await input.signer.sign({ payloadPath: record.package.payload_path, payloadSha256: record.package.payload_sha256 });
  if (!existsSync(signed.signaturePath)) throw new Error("eLTAX signature file missing");
  return input.store.save({ ...record, status: "signed", signature: { algorithm: signed.algorithm, certificate_fingerprint_sha256: signed.certificateFingerprintSha256, signature_path: signed.signaturePath, signature_sha256: sha256(readFileSync(signed.signaturePath)), signed_at: getClock().nowIso() } });
}

export async function sendEltaxSubmission(input: { store: EltaxSubmissionStore; submissionId: string; transport: EltaxTransport }): Promise<EltaxSubmissionRecord> {
  if (input.store.production && !input.store.officialIntegrationReady) throw new Error("production eLTAX send is not enabled");
  let record = input.store.get(input.submissionId);
  if (record.status !== "signed" || !record.signature || !input.transport.certified) throw new Error("eLTAX submission requires a signature and certified transport");
  const signature = record.signature;
  if (sha256(readFileSync(record.package.payload_path)) !== record.package.payload_sha256 || sha256(readFileSync(signature.signature_path)) !== signature.signature_sha256) throw new Error("eLTAX signed evidence changed");
  const requestId = `${record.submission_id}-${record.attempts.length + 1}`;
  record = input.store.save({ ...record, status: "sending", request_id: requestId, attempts: [...record.attempts, { attempted_at: getClock().nowIso(), request_id: requestId, outcome: "started" }] });
  const result = await input.transport.send({ package: record.package, signaturePath: signature.signature_path, idempotencyKey: record.idempotency_key, requestId });
  if (result.requestId !== requestId) throw new Error("eLTAX request id mismatch");
  const attempts = record.attempts.map((row, index) => index === record.attempts.length - 1 ? { ...row, outcome: "received" as const } : row);
  return input.store.save({ ...record, status: result.status, local_receipt_number: result.localReceiptNumber, attempts });
}

export async function recoverInterruptedEltaxSubmission(input: { store: EltaxSubmissionStore; submissionId: string; transport: EltaxTransport }): Promise<EltaxSubmissionRecord> {
  const record = input.store.get(input.submissionId);
  if (record.status !== "sending") return record;
  if (!input.transport.certified || !input.transport.lookup || !record.request_id) throw new Error("certified eLTAX receipt lookup is required");
  const found = await input.transport.lookup({ requestId: record.request_id, idempotencyKey: record.idempotency_key });
  if (found.status === "unknown") return record;
  if (found.status === "not_found") return input.store.save({ ...record, status: "signed", attempts: record.attempts.map((row, index) => index === record.attempts.length - 1 ? { ...row, outcome: "failed" as const } : row) });
  if (found.status !== "found") return record;
  return input.store.save({ ...record, status: found.result, local_receipt_number: found.localReceiptNumber, attempts: record.attempts.map((row, index) => index === record.attempts.length - 1 ? { ...row, outcome: "received" as const } : row) });
}

/** eLTAX has an independent schema and adapter; an e-Tax package or transport cannot cross this boundary. */
export async function sendEltaxPackage(input: {
  package: unknown;
  idempotencyKey: string;
  transport: EltaxTransport;
}): Promise<{ localReceiptNumber: string }> {
  if (input.transport.channel !== "eltax") throw new Error("e-Tax transport cannot send an eLTAX package");
  if (!input.transport.certified) throw new Error("eLTAX transport adapter is not certified");
  const pkg = eltaxOfficialPackageSchema.parse(input.package);
  const result = await input.transport.send({ package: pkg, signaturePath: "legacy-boundary", idempotencyKey: input.idempotencyKey, requestId: input.idempotencyKey });
  if (!result.localReceiptNumber) throw new Error("eLTAX transport did not return a local receipt number");
  return { localReceiptNumber: result.localReceiptNumber };
}
