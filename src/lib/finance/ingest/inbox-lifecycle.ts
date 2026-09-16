/**
 * Mark document-io inbox item done when all batch rows are terminal.
 */
import { loadDocumentIo, saveDocumentIo } from "../../document-io.js";
import { currentDate } from "../../utils.js";
import type {
  IngestStagingBatch,
  IngestStagingRow,
} from "../../../../schemas/finance/ingest.js";

function isTerminal(row: IngestStagingRow): boolean {
  if (row.status === "posted" || row.status === "skipped") return true;
  // Contracts are never journaled; needs_review is the finished state for ingest.
  if (row.source_kind === "contracts" && row.status === "needs_review") return true;
  return false;
}

export function markIngestInboxDoneIfComplete(
  batch: IngestStagingBatch | undefined,
  batchRows: IngestStagingRow[],
): boolean {
  if (!batch || batchRows.length === 0) return false;
  if (!batchRows.every(isTerminal)) return false;

  const data = loadDocumentIo();
  const item = data.inbox_items.find((i) => i.path === batch.logical_path);
  if (!item || item.status === "done") return false;
  item.status = "done";
  item.processed_at = currentDate();
  const note = `orgos ingest post batch ${batch.batch_id}`;
  item.notes = [item.notes, note].filter(Boolean).join("\n");
  saveDocumentIo(data);
  return true;
}
