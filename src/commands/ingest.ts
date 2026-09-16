import { ingestSourceKindSchema } from "../../schemas/finance/ingest.js";
import {
  requireCliDataWrite,
  resolveCliOperatorId,
} from "../lib/console-auth/cli-operator.js";
import {
  classifyIngestStaging,
  ensureFinanceIngestInboxScaffold,
  loadIngestStaging,
  parseIngestFile,
  parseIngestPending,
  postIngestBatch,
  scanIngestInbox,
  writeIngestReviewReport,
} from "../lib/finance/ingest/index.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function runIngestStatus(opts: { json?: boolean }): void {
  const staging = loadIngestStaging();
  const byStatus: Record<string, number> = {};
  for (const row of staging.rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }
  const result = {
    batches: staging.batches.length,
    rows: staging.rows.length,
    by_status: byStatus,
  };
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(`# ingest status`);
  console.log(`batches: ${result.batches} · rows: ${result.rows}`);
  for (const [k, v] of Object.entries(byStatus)) {
    console.log(`  ${k}: ${v}`);
  }
}

export function runIngestScaffold(opts: { json?: boolean }): void {
  const result = ensureFinanceIngestInboxScaffold();
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(
    `✓ finance ingest scaffold · ensured ${result.dirs_ensured.length} · created ${result.dirs_created.length} · readmes ${result.readmes_copied.length} · rules ${result.rules_seeded ? "seeded" : "kept"}`,
  );
  for (const p of result.readmes_copied.slice(0, 20)) {
    console.log(`  ${p}`);
  }
}

export function runIngestScan(opts: { write?: boolean; json?: boolean }): void {
  const result = scanIngestInbox({ write: Boolean(opts.write) });
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(
    `✓ ingest scan ${opts.write ? "wrote" : "dry-run"} · registered ${result.registered.length} · skipped ${result.skipped_existing}`,
  );
  for (const r of result.registered.slice(0, 30)) {
    console.log(`  ${r.id} ${r.category} ${r.path}`);
  }
}

export function runIngestParse(opts: {
  source?: string;
  file?: string;
  write?: boolean;
  json?: boolean;
}): void {
  if (opts.file) {
    if (!opts.source) {
      throw new Error("--source is required with --file");
    }
    const source = ingestSourceKindSchema.parse(opts.source);
    const result = parseIngestFile({
      source,
      filePath: opts.file,
      write: Boolean(opts.write),
    });
    if (opts.json) {
      printJson(result);
      return;
    }
    console.log(
      `✓ ingest parse ${result.dry_run ? "dry-run" : "wrote"} · batch ${result.batch_id ?? "—"} · rows +${result.added_rows}`,
    );
    for (const n of result.notes) console.warn(`  ⚠ ${n}`);
    return;
  }
  const source = opts.source ? ingestSourceKindSchema.parse(opts.source) : undefined;
  const results = parseIngestPending({ source, write: Boolean(opts.write) });
  if (opts.json) {
    printJson(results);
    return;
  }
  console.log(`✓ ingest parse ${opts.write ? "wrote" : "dry-run"} · files ${results.length}`);
  for (const r of results) {
    console.log(
      `  batch ${r.batch_id ?? "—"} +${r.added_rows} rows${r.skipped_duplicate_file ? " (dup file)" : ""}`,
    );
    for (const n of r.notes) console.warn(`  ⚠ ${n}`);
  }
}

export function runIngestClassify(opts: { write?: boolean; json?: boolean }): void {
  const result = classifyIngestStaging({ write: Boolean(opts.write) });
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(
    `✓ ingest classify ${result.dry_run ? "dry-run" : "wrote"} · classified ${result.classified} · needs_review ${result.needs_review}`,
  );
}

export function runIngestReview(opts: { period?: string; json?: boolean }): void {
  const result = writeIngestReviewReport({ period: opts.period });
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(`✓ ingest review → ${result.path}`);
  console.log(
    `  needs_review ${result.needs_review} · classified ${result.classified} · contracts ${result.contract_candidates}`,
  );
}

export function runIngestPost(opts: {
  batch: string;
  write?: boolean;
  json?: boolean;
}): void {
  if (opts.write) {
    requireCliDataWrite({ command: "ingest post", permission: "escalate:plan" });
  }
  const result = postIngestBatch({
    batchId: opts.batch,
    write: Boolean(opts.write),
    authorizedBy: resolveCliOperatorId(),
  });
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(
    `✓ ingest post ${result.dry_run ? "dry-run" : "wrote"} · posted ${result.posted} · skipped ${result.skipped}`,
  );
  for (const id of result.redirected_to_intake) {
    console.warn(`  → asset-band review: ${id}`);
  }
  if (result.bank_statements_added != null) {
    console.log(`  bank-statements +${result.bank_statements_added}`);
  }
  for (const e of result.errors) console.error(`  ✗ ${e}`);
}
