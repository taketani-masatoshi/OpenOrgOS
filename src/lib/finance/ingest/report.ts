import { writeTrackedFile, getDocsDir } from "../../utils.js";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { loadIngestStaging } from "./store.js";
import { loadDocumentIo } from "../../document-io.js";
import { categoryToSourceKind } from "./store.js";

export type IngestReviewResult = {
  path: string;
  needs_review: number;
  classified: number;
  posted: number;
  contract_candidates: number;
};

export function writeIngestReviewReport(input?: {
  period?: string;
}): IngestReviewResult {
  const staging = loadIngestStaging();
  const period =
    input?.period ??
    new Date().toISOString().slice(0, 7);
  const needs = staging.rows.filter((r) => r.status === "needs_review");
  const classified = staging.rows.filter((r) => r.status === "classified");
  const posted = staging.rows.filter((r) => r.status === "posted");
  const contracts = staging.batches.filter((b) => b.source_kind === "contracts");

  const io = loadDocumentIo();
  const pdfPending = io.inbox_items.filter(
    (i) =>
      i.status === "pending" &&
      i.path.toLowerCase().endsWith(".pdf") &&
      categoryToSourceKind(i.category),
  );

  const lines = [
    `# 取込レビュー — ${period}`,
    "",
    "| 区分 | 件数 |",
    "|------|-----:|",
    `| needs_review | ${needs.length} |`,
    `| classified（post 可） | ${classified.length} |`,
    `| posted | ${posted.length} |`,
    `| 契約バッチ（仕訳なし） | ${contracts.length} |`,
    `| PDF 未変換（pending） | ${pdfPending.length} |`,
    "",
    "## 要確認行",
    "",
  ];

  if (needs.length === 0) {
    lines.push("_なし_");
  } else {
    lines.push("| row_id | 日付 | 方向 | 金額 | 相手 | 摘要 | メモ |");
    lines.push("|--------|------|------|-----:|------|------|------|");
    for (const r of needs.slice(0, 200)) {
      lines.push(
        `| ${r.row_id} | ${r.occurred_on} | ${r.direction} | ${r.amount_yen.toLocaleString("ja-JP")} | ${r.payee} | ${r.description} | ${r.review_notes.join("; ")} |`,
      );
    }
  }

  lines.push("", "## 契約起票候補", "");
  if (contracts.length === 0) {
    lines.push("_なし_");
  } else {
    for (const b of contracts) {
      lines.push(`- \`${b.logical_path}\`（${b.notes.join(" / ") || "MD"}）`);
    }
  }

  lines.push("", "## PDF ガイダンス", "");
  if (pdfPending.length === 0) {
    lines.push("_なし_");
  } else {
    lines.push("次の PDF は OrgOS では読めません。CSV/MD に変換して同カテゴリへ再投入してください。");
    for (const p of pdfPending) {
      lines.push(`- \`${p.path}\``);
    }
  }

  lines.push(
    "",
    "## 次のコマンド",
    "",
    "```bash",
    "orgos ingest classify --write",
    "orgos ingest post --batch <batch_id> --write",
    "```",
    "",
  );

  const dir = join(getDocsDir(), "reports", "ingest");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${period}-ingest.md`);
  writeTrackedFile(path, lines.join("\n"));
  return {
    path,
    needs_review: needs.length,
    classified: classified.length,
    posted: posted.length,
    contract_candidates: contracts.length,
  };
}
