/**
 * Audit pack index. Path: src/lib/audit-pack/index.ts
 * Ids only. Does not copy document bodies.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "../propose/report.js";

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

function pathForRef(kind: string, id: string): string | null {
  if (kind === "contractId") return join(getDataDir(), "contracts", `${id}.yaml`);
  if (kind === "journalEntryId") return join(getDataDir(), "finance", "journal-entries.yaml");
  return null;
}

export function buildAuditPackIndex(
  samples: Array<AuditSampleRef & Record<string, unknown>>,
): {
  version: 1;
  samples: AuditSampleRef[];
  missing_refs: string[];
} {
  const missing_refs: string[] = [];
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
        if (typeof value === "string") {
          indexed[key] = value;
          const candidate = pathForRef(key, value);
          if (candidate && !existsSync(candidate)) {
            missing_refs.push(`${sample.sampleId}:${key}:${value}`);
          }
        }
      }
      return indexed;
    }),
    missing_refs,
  };
}

/** One pack document. Ids only. */
export function renderAuditPack(
  samples: Array<AuditSampleRef & Record<string, unknown>>,
): Record<string, unknown> {
  const index = buildAuditPackIndex(samples);
  return flattenProposeReport(
    makeProposeReport({
      kind: "audit-pack",
      depth: "L1",
      human_gate: { apply: "human" },
      payload: {
        version: index.version,
        samples: index.samples,
        missing_refs: index.missing_refs,
      },
    }),
  );
}
