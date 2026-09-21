import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
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
  send(input: { package: EltaxOfficialPackage; idempotencyKey: string }): Promise<{ localReceiptNumber: string }>;
}

const transitions: Record<EltaxSubmissionRecord["status"], EltaxSubmissionRecord["status"][]> = {
  prepared: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
};

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
  constructor(private readonly root: string) {
    if (root.split(sep).includes("etax")) throw new Error("eLTAX state cannot use an e-Tax directory");
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
      const record = eltaxSubmissionRecordSchema.parse({
        schema: "orgos.jp.eltax-submission.v1", submission_id: getIdGenerator().uniqueId("ELTAX"), revision: 0,
        idempotency_key: idempotencyKey, status: "prepared", package: parsedPackage, created_at: now, updated_at: now,
      });
      atomicJsonWrite(this.path(record.submission_id), record);
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
      return parsed;
    });
  }
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
  return input.transport.send({ package: pkg, idempotencyKey: input.idempotencyKey });
}
