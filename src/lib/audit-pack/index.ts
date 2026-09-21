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

/** Absolute path + tenant-relative ref when a file SoT exists for this link kind. */
function pathForRef(kind: string, id: string): { abs: string; rel: string } | null {
  if (kind === "contractId") {
    return {
      abs: join(getDataDir(), "contracts", `${id}.yaml`),
      rel: `data/contracts/${id}.yaml`,
    };
  }
  if (kind === "journalEntryId") {
    return {
      abs: join(getDataDir(), "finance", "journal-entries.yaml"),
      rel: "data/finance/journal-entries.yaml",
    };
  }
  return null;
}

export function buildAuditPackIndex(
  samples: Array<AuditSampleRef & Record<string, unknown>>,
): {
  version: 1;
  samples: AuditSampleRef[];
  missing_refs: string[];
  inputs_ref: string[];
} {
  const missing_refs: string[] = [];
  const inputs = new Set<string>();
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
          if (candidate) {
            if (existsSync(candidate.abs)) inputs.add(candidate.rel);
            else missing_refs.push(`${sample.sampleId}:${key}:${value}`);
          }
        }
      }
      return indexed;
    }),
    missing_refs,
    inputs_ref: [...inputs],
  };
}

/** One pack document. Ids only. Depth L2 when a tenant SoT file was found. */
export function renderAuditPack(
  samples: Array<AuditSampleRef & Record<string, unknown>>,
): Record<string, unknown> {
  const index = buildAuditPackIndex(samples);
  return flattenProposeReport(
    makeProposeReport({
      kind: "audit-pack",
      depth: index.inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref: index.inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        version: index.version,
        samples: index.samples,
        missing_refs: index.missing_refs,
      },
    }),
  );
}
