import type {
  FilingChannel,
  FilingKind,
  FilingPackageSchemaId,
  FilingStatus,
} from "../../../schemas/efiling/filing.js";
import { DEFAULT_RETENTION_YEARS } from "../../../schemas/efiling/filing.js";
import { assertFilingKind } from "./amendment.js";
import { filingError } from "./errors.js";
import { filingSha256Digest, filingSlotKey, hashFilingContent } from "./hash.js";
import {
  assertIdempotentPackage,
  assertSlotAvailable,
  assertWriteRevision,
} from "./idempotency.js";
import { assertRetentionChange, retentionUntilDate } from "./retention.js";
import type { FilingAttempt } from "./recovery.js";
import { schemaForChannel } from "./channel.js";

export type FilingAuditRow = {
  action: string;
  packageSha256: string;
  priorReceiptNumber?: string;
};

export type FilingRecord = {
  id: string;
  channel: FilingChannel;
  schema: FilingPackageSchemaId;
  packageId: string;
  packageSha256: string;
  status: FilingStatus;
  contentHash: string;
  slotKey: string;
  idempotencyKey: string;
  filingKind: FilingKind;
  priorReceiptNumber?: string;
  taxpayerId: string;
  procedureCode: string;
  taxYear: string;
  revision: number;
  writeRevision: number;
  legalHold: boolean;
  retentionUntil: string;
  payload: unknown;
  sourceReferences: unknown;
  specVersion: string;
  requestId?: string;
  receiptNumber?: string;
  attempts: FilingAttempt[];
  audit: FilingAuditRow[];
  createdAt: string;
};

const ACTIVE = new Set<FilingStatus>([
  "GENERATED",
  "SCHEMA_VALID",
  "BUSINESS_RULE_VALID",
  "APPROVED",
  "SIGNED",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "RECEIVED_BY_ETAX",
  "TRANSPORT_ERROR",
]);

export class FilingStore {
  readonly channel: FilingChannel;
  readonly production: boolean;
  private readonly rows = new Map<string, FilingRecord>();
  private readonly now: string;
  private readonly retentionYears: number;

  constructor(opts: {
    channel: FilingChannel;
    production?: boolean;
    encryptedStorage?: boolean;
    retentionYears?: number;
    now?: string;
    rootPath?: string;
  }) {
    if (opts.production && opts.encryptedStorage !== true) {
      throw filingError(
        "EFILING_ENCRYPTED_STORAGE_REQUIRED",
        "production filing state requires encrypted storage",
        "PRODUCTION_DISABLED"
      );
    }
    assertChannelRoot(opts.channel, opts.rootPath);
    this.channel = opts.channel;
    this.production = Boolean(opts.production);
    this.now = opts.now ?? "2026-09-21T00:00:00.000Z";
    this.retentionYears = opts.retentionYears ?? DEFAULT_RETENTION_YEARS;
  }

  create(input: {
    id: string;
    packageId: string;
    taxpayerId: string;
    procedureCode: string;
    taxYear: string;
    revision: number;
    payload: unknown;
    sourceReferences: unknown;
    specVersion: string;
    idempotencyKey: string;
    filingKind?: FilingKind;
    priorReceiptNumber?: string;
    schema: FilingPackageSchemaId;
  }): FilingRecord {
    if (input.schema !== schemaForChannel(this.channel)) {
      throw filingError(
        "EFILING_CHANNEL_SCHEMA",
        `${input.schema} cannot be stored on the ${this.channel} channel`,
        "SPEC_BLOCKED"
      );
    }
    const filingKind = input.filingKind ?? "original";
    assertFilingKind({ filingKind, priorReceiptNumber: input.priorReceiptNumber });
    const contentHash = hashFilingContent({
      taxpayerId: input.taxpayerId,
      procedureCode: input.procedureCode,
      taxYear: input.taxYear,
      revision: input.revision,
      payload: input.payload,
      sourceReferences: input.sourceReferences,
      specVersion: input.specVersion,
      filingKind,
      priorReceiptNumber: input.priorReceiptNumber,
    });
    const packageSha256 = filingSha256Digest(JSON.stringify({ contentHash, schema: input.schema }));
    const existing = [...this.rows.values()].find(
      (row) => row.idempotencyKey === input.idempotencyKey
    );
    const decision = assertIdempotentPackage({
      existing,
      idempotencyKey: input.idempotencyKey,
      packageSha256,
    });
    if (decision === "reuse" && existing) return existing;
    const slotKey = filingSlotKey({
      taxpayerId: input.taxpayerId,
      procedureCode: input.procedureCode,
      taxYear: input.taxYear,
      revision: input.revision,
    });
    assertSlotAvailable(
      [...this.rows.values()].some((row) => row.slotKey === slotKey && ACTIVE.has(row.status))
    );
    const record: FilingRecord = {
      id: input.id,
      channel: this.channel,
      schema: input.schema,
      packageId: input.packageId,
      packageSha256,
      status: "DRAFT",
      contentHash,
      slotKey,
      idempotencyKey: input.idempotencyKey,
      filingKind,
      priorReceiptNumber: input.priorReceiptNumber,
      taxpayerId: input.taxpayerId,
      procedureCode: input.procedureCode,
      taxYear: input.taxYear,
      revision: input.revision,
      writeRevision: 1,
      legalHold: false,
      retentionUntil: retentionUntilDate(this.now, this.retentionYears),
      payload: input.payload,
      sourceReferences: input.sourceReferences,
      specVersion: input.specVersion,
      attempts: [],
      audit: [
        {
          action: "created",
          packageSha256,
          priorReceiptNumber: input.priorReceiptNumber,
        },
      ],
      createdAt: this.now,
    };
    this.rows.set(record.id, record);
    return record;
  }

  get(id: string): FilingRecord {
    const row = this.rows.get(id);
    if (!row) throw filingError("EFILING_NOT_FOUND", `filing not found: ${id}`);
    return row;
  }

  save(next: FilingRecord, expectedWriteRevision: number): FilingRecord {
    const current = this.get(next.id);
    assertWriteRevision(expectedWriteRevision, current.writeRevision);
    if (next.legalHold === false && current.legalHold) {
      assertRetentionChange({
        legalHold: true,
        currentUntil: current.retentionUntil,
        releaseHold: true,
      });
    }
    assertRetentionChange({
      legalHold: current.legalHold,
      currentUntil: current.retentionUntil,
      nextUntil: next.retentionUntil,
    });
    const stored = { ...next, writeRevision: current.writeRevision + 1 };
    this.rows.set(stored.id, stored);
    return stored;
  }
}

function assertChannelRoot(channel: FilingChannel, rootPath: string | undefined): void {
  if (!rootPath) return;
  const segments = rootPath.split(/[/\\]/).filter(Boolean);
  if (channel === "eltax" && segments.includes("etax")) {
    throw filingError(
      "EFILING_CHANNEL_ROOT",
      "eLTAX state cannot be stored under an etax path",
      "SPEC_BLOCKED"
    );
  }
  if (channel === "etax" && segments.includes("eltax")) {
    throw filingError(
      "EFILING_CHANNEL_ROOT",
      "e-Tax state cannot be stored under an eltax path",
      "SPEC_BLOCKED"
    );
  }
}
