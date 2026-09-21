import type { FilingChannel, FilingKind } from "../../../schemas/efiling/filing.js";
import { schemaForChannel } from "./channel.js";
import { filingError } from "./errors.js";
import type { FilingRecord } from "./store.js";
import { FilingStore } from "./store.js";
import { transitionFilingStatus } from "./state-machine.js";

const MOCK_STEPS = [
  "GENERATED",
  "SCHEMA_VALID",
  "BUSINESS_RULE_VALID",
  "APPROVED",
  "SIGNED",
  "READY_TO_SUBMIT",
] as const;

/**
 * Mock-only lifecycle. Does not place status or hashes by hand:
 * each step is a legal transition and the receipt comes from the mock transport.
 * Real procedure codes stay unsupported; this path uses the internal mock procedure.
 */
export function runMockFilingLifecycle(input: {
  channel: FilingChannel;
  id: string;
  packageId: string;
  taxpayerId: string;
  procedureCode: string;
  taxYear: string;
  revision: number;
  payload: unknown;
  sourceReferences?: unknown;
  specVersion: string;
  idempotencyKey: string;
  filingKind?: FilingKind;
  priorReceiptNumber?: string;
  now?: string;
  rootPath?: string;
}): FilingRecord {
  if (!input.procedureCode.startsWith("EFILING-MOCK")) {
    throw filingError(
      "EFILING_MOCK_PROCEDURE",
      "mock lifecycle only accepts the internal EFILING-MOCK procedure",
      "SPEC_BLOCKED",
    );
  }
  const store = new FilingStore({
    channel: input.channel,
    now: input.now,
    rootPath: input.rootPath,
  });
  let record = store.create({
    id: input.id,
    packageId: input.packageId,
    taxpayerId: input.taxpayerId,
    procedureCode: input.procedureCode,
    taxYear: input.taxYear,
    revision: input.revision,
    payload: input.payload,
    sourceReferences: input.sourceReferences ?? [],
    specVersion: input.specVersion,
    idempotencyKey: input.idempotencyKey,
    filingKind: input.filingKind,
    priorReceiptNumber: input.priorReceiptNumber,
    schema: schemaForChannel(input.channel),
  });
  for (const next of MOCK_STEPS) {
    record = store.save(
      { ...record, status: transitionFilingStatus(record.status, next) },
      record.writeRevision,
    );
  }
  const requestId = `mock-req-${input.id}`;
  record = store.save(
    {
      ...record,
      status: transitionFilingStatus(record.status, "SUBMITTED"),
      requestId,
      attempts: [...record.attempts, { requestId, outcome: "started" }],
    },
    record.writeRevision,
  );
  const receiptNumber = `MOCK-NOT-NTA-${input.channel}-${input.id}`;
  record = store.save(
    {
      ...record,
      status: transitionFilingStatus(record.status, "RECEIVED_BY_ETAX"),
      receiptNumber,
      attempts: record.attempts.map((row) =>
        row.requestId === requestId ? { ...row, outcome: "received" as const } : row,
      ),
    },
    record.writeRevision,
  );
  return record;
}

export function assertMockProviderForbidden(environment: "mock" | "test" | "production"): void {
  if (environment !== "mock") {
    throw filingError(
      "EFILING_MOCK_FORBIDDEN",
      `mock provider is forbidden for --env ${environment}`,
      "PRODUCTION_DISABLED",
    );
  }
}
