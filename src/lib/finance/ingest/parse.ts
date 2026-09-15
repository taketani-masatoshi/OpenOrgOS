import { getClock } from "../../runtime-context.js";
import { toLogicalPath } from "../../utils.js";
import {
  ingestStagingBatchSchema,
  ingestStagingRowSchema,
  type IngestSourceKind,
  type IngestStagingBatch,
  type IngestStagingRow,
} from "../../../../schemas/finance/ingest.js";
import { parseIngestSource, fileFingerprint, rowFingerprint } from "./adapters/index.js";
import {
  categoryToSourceKind,
  loadIngestStaging,
  readInboxFileContent,
  saveIngestStaging,
  scanIngestInbox,
} from "./store.js";
import { loadDocumentIo } from "../../document-io.js";

export type IngestParseResult = {
  batch_id: string | null;
  added_rows: number;
  skipped_duplicate_file: boolean;
  skipped_duplicate_rows: number;
  notes: string[];
  dry_run: boolean;
  preview_rows?: IngestStagingRow[];
};

function nextBatchId(source: IngestSourceKind, existing: string[]): string {
  const prefix = `ING-${source.toUpperCase().slice(0, 4)}-`;
  const nums = existing
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function parseIngestFile(input: {
  source: IngestSourceKind;
  filePath: string;
  write?: boolean;
}): IngestParseResult {
  const { content, fileName, absPath, bytes } = readInboxFileContent(input.filePath);
  const logical = toLogicalPath(absPath);
  const fp = fileFingerprint(bytes);
  const staging = loadIngestStaging();
  if (staging.batches.some((b) => b.file_fingerprint === fp)) {
    return {
      batch_id: null,
      added_rows: 0,
      skipped_duplicate_file: true,
      skipped_duplicate_rows: 0,
      notes: [`duplicate file fingerprint: ${fp.slice(0, 12)}`],
      dry_run: !input.write,
    };
  }

  const parsed = parseIngestSource(input.source, content, fileName);
  const batch_id = nextBatchId(
    input.source,
    staging.batches.map((b) => b.batch_id),
  );
  const evidenceBase = [`inbox:${logical}`, `sha256:${fp}`];
  const existingFp = new Set(staging.rows.map((r) => r.fingerprint));
  const rows: IngestStagingRow[] = [];
  let skipped_duplicate_rows = 0;

  parsed.rows.forEach((row, idx) => {
    const fingerprint = rowFingerprint({
      source_kind: input.source,
      occurred_on: row.occurred_on,
      direction: row.direction,
      amount_yen: row.amount_yen,
      payee: row.payee,
      description: row.description,
      logical_path: logical,
    });
    if (existingFp.has(fingerprint)) {
      skipped_duplicate_rows += 1;
      return;
    }
    existingFp.add(fingerprint);
    rows.push(
      ingestStagingRowSchema.parse({
        row_id: `${batch_id}-R${String(idx + 1).padStart(3, "0")}`,
        fingerprint,
        batch_id,
        source_kind: input.source,
        occurred_on: row.occurred_on,
        direction: row.direction,
        amount_yen: row.amount_yen,
        payee: row.payee,
        description: row.description,
        category_hint: row.category_hint,
        tax_category: row.tax_category,
        status: "parsed",
        evidence_refs: evidenceBase,
        raw: row.raw,
        review_notes: [],
      }),
    );
  });

  const batch: IngestStagingBatch = ingestStagingBatchSchema.parse({
    batch_id,
    source_kind: input.source,
    file_fingerprint: fp,
    imported_at: getClock().now().toISOString(),
    logical_path: logical,
    row_ids: rows.map((r) => r.row_id),
    notes: parsed.notes,
  });

  if (!input.write) {
    return {
      batch_id,
      added_rows: rows.length,
      skipped_duplicate_file: false,
      skipped_duplicate_rows,
      notes: parsed.notes,
      dry_run: true,
      preview_rows: rows.slice(0, 20),
    };
  }

  staging.batches.push(batch);
  staging.rows.push(...rows);
  saveIngestStaging(staging);
  return {
    batch_id,
    added_rows: rows.length,
    skipped_duplicate_file: false,
    skipped_duplicate_rows,
    notes: parsed.notes,
    dry_run: false,
  };
}

/** Parse all pending inbox items for a source (or all finance sources). */
export function parseIngestPending(input: {
  source?: IngestSourceKind;
  write?: boolean;
}): IngestParseResult[] {
  scanIngestInbox({ write: false });
  const io = loadDocumentIo();
  const results: IngestParseResult[] = [];
  for (const item of io.inbox_items) {
    if (item.status === "done" || item.status === "rejected") continue;
    const kind = categoryToSourceKind(item.category);
    if (!kind) continue;
    if (input.source && kind !== input.source) continue;
    try {
      results.push(
        parseIngestFile({
          source: kind,
          filePath: item.path,
          write: input.write,
        }),
      );
    } catch (err) {
      results.push({
        batch_id: null,
        added_rows: 0,
        skipped_duplicate_file: false,
        skipped_duplicate_rows: 0,
        notes: [`${item.path}: ${err instanceof Error ? err.message : String(err)}`],
        dry_run: !input.write,
      });
    }
  }
  return results;
}
