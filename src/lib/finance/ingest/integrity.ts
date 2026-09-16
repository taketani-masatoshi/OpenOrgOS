/**
 * Integrity checks for finance ingest staging / bank dual-path.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { bankStatementFileSchema } from "../../../../schemas/jp-bank-corporate.js";
import { getDataDir } from "../../utils.js";
import { loadIngestStaging } from "./store.js";

export type IngestIntegrityIssue = {
  level: "warning" | "error";
  message: string;
};

export function financeIngestIntegrityIssues(): IngestIntegrityIssue[] {
  const issues: IngestIntegrityIssue[] = [];
  const stagingPath = join(getDataDir(), "finance", "ingest-staging.yaml");
  if (!existsSync(stagingPath)) return issues;

  const staging = loadIngestStaging();
  const needsReview = staging.rows.filter((r) => r.status === "needs_review");
  if (needsReview.length > 0) {
    issues.push({
      level: "warning",
      message: `ingest staging: ${needsReview.length} row(s) needs_review (orgos ingest review)`,
    });
  }
  const parsed = staging.rows.filter((r) => r.status === "parsed");
  if (parsed.length > 0) {
    issues.push({
      level: "warning",
      message: `ingest staging: ${parsed.length} row(s) still parsed — run classify`,
    });
  }
  const classified = staging.rows.filter((r) => r.status === "classified");
  if (classified.length > 0) {
    issues.push({
      level: "warning",
      message: `ingest staging: ${classified.length} classified row(s) not posted`,
    });
  }

  const bankPath = join(getDataDir(), "finance", "bank-statements.yaml");
  if (existsSync(bankPath)) {
    const bank = bankStatementFileSchema.parse(
      YAML.parse(readFileSync(bankPath, "utf-8")),
    );
    const statementFingerprints = new Set(
      bank.import_batches
        .map((b) => b.source_file_fingerprint)
        .filter((x): x is string => Boolean(x)),
    );
    for (const batch of staging.batches) {
      if (batch.source_kind !== "bank") continue;
      const posted = staging.rows.some(
        (r) => r.batch_id === batch.batch_id && r.status === "posted",
      );
      if (posted && !statementFingerprints.has(batch.file_fingerprint)) {
        issues.push({
          level: "warning",
          message: `ingest bank batch ${batch.batch_id} posted but bank-statements.yaml missing source_file_fingerprint`,
        });
      }
    }
    for (const b of bank.import_batches) {
      if (!b.source_file_fingerprint) continue;
      const ingestPosted = staging.batches.some(
        (ib) =>
          ib.source_kind === "bank" &&
          ib.file_fingerprint === b.source_file_fingerprint &&
          staging.rows.some((r) => r.batch_id === ib.batch_id && r.status === "posted"),
      );
      const viaStatementOnly = !b.ingest_batch_id;
      if (viaStatementOnly && ingestPosted) {
        issues.push({
          level: "warning",
          message: `bank-statements batch ${b.id} and ingest both cover file ${b.source_file_fingerprint.slice(0, 12)}… — prefer single path`,
        });
      }
    }
  }

  return issues;
}
