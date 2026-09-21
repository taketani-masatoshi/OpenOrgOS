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

export function buildAuditPackIndex(samples: AuditSampleRef[]): {
  version: 1;
  samples: AuditSampleRef[];
} {
  return {
    version: 1,
    samples: samples.map((sample) => ({
      sampleId: sample.sampleId,
      contractId: sample.contractId,
      invoiceId: sample.invoiceId,
      transferRef: sample.transferRef,
      journalEntryId: sample.journalEntryId,
    })),
  };
}
