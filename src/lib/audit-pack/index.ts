/**
 * Audit pack index. Path: src/lib/audit-pack/index.ts
 * Ids only. Does not copy document bodies.
 */

export type AuditSampleRef = {
  sampleId: string;
  contractId?: string;
  invoiceId?: string;
  transferRef?: string;
  journalEntryId?: string;
};

const AUDIT_ID_KEYS = [
  "sampleId",
  "contractId",
  "invoiceId",
  "transferRef",
  "journalEntryId",
] as const;

const AUDIT_BODY_KEYS = ["body", "documentBody", "text", "content", "accountNumber"] as const;

export function buildAuditPackIndex(
  samples: Array<AuditSampleRef & Record<string, unknown>>,
): {
  version: 1;
  samples: AuditSampleRef[];
} {
  return {
    version: 1,
    samples: samples.map((sample) => {
      for (const key of AUDIT_BODY_KEYS) {
        if (key in sample) throw new Error(`refused body field ${key}`);
      }
      if (!sample.contractId && !sample.invoiceId && !sample.transferRef && !sample.journalEntryId) {
        throw new Error(`${sample.sampleId}: needs a contract, invoice, transfer, or journal id`);
      }
      const indexed: AuditSampleRef = { sampleId: sample.sampleId };
      for (const key of AUDIT_ID_KEYS) {
        if (key === "sampleId") continue;
        const value = sample[key];
        if (typeof value === "string") indexed[key] = value;
      }
      return indexed;
    }),
  };
}
