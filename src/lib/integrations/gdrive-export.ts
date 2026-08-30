/**
 * Google Drive export — human-readable PDFs of OrgOS canonical records.
 * Path: src/lib/integrations/gdrive-export.ts
 *
 * The tenant YAML/MD stays the source of truth. What lands in Drive is a
 * derived, human-readable copy; editing it there changes nothing in OrgOS.
 * Only L0–L1 material is exportable — raw data/ YAML, mail bodies and other L2
 * records are rejected before a single byte leaves the machine.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { z } from "zod";
import {
  createPdfWriter,
  pdfBulletList,
  pdfMutedNote,
  pdfParagraph,
  pdfSection,
  pdfSubtitle,
  pdfTitle,
  type PdfWriter,
} from "../pdf.js";
import { getDataDir, getDocsDir, loadRegistryFile, writeYamlFile } from "../utils.js";
import { getTenantId } from "../tenant.js";
import { loadHandoff } from "../routing.js";
import { loadExecutiveTasks } from "../data.js";
import { generateReceiptPdfBuffer } from "../receipt-pdf.js";
import { loadSignedReceiptForPdf } from "../receipt-qr.js";
import { getGmailOAuthClientConfig } from "../correspondence/gmail-oauth.js";
import {
  isConnectorTokenExpired,
  loadConnectorSettings,
  loadConnectorToken,
  saveConnectorToken,
} from "./connector-store.js";

export const DRIVE_UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink";

/**
 * Human-facing document trees only. `data/`, `records/` and correspondence
 * drafts are absent on purpose — they hold L2 material.
 */
const DOCUMENT_ALLOWLIST = [
  "company/",
  "compliance/",
  "reports/dashboard/",
  "reports/agent-summaries/",
] as const;

export type DriveExportKind = "receipt" | "document" | "work_order" | "executive_tasks";

const driveExportRecordSchema = z.object({
  kind: z.string().min(1),
  /** OrgOS id or canonical path this file was rendered from. */
  source_ref: z.string().min(1),
  file_id: z.string().min(1),
  file_name: z.string().min(1),
  folder_id: z.string().optional(),
  exported_at: z.string(),
  exported_by: z.string().optional(),
});

const driveExportsFileSchema = z.object({
  version: z.literal(1).default(1),
  exports: z.array(driveExportRecordSchema).default([]),
});

export type DriveExportRecord = z.output<typeof driveExportRecordSchema>;

function exportsPath(): string {
  return join(getDataDir(), "integrations", "gdrive-exports.yaml");
}

export function listDriveExports(): DriveExportRecord[] {
  return loadRegistryFile(exportsPath(), driveExportsFileSchema, () =>
    driveExportsFileSchema.parse({ version: 1, exports: [] }),
  ).exports;
}

function recordDriveExport(record: DriveExportRecord): void {
  const file = loadRegistryFile(exportsPath(), driveExportsFileSchema, () =>
    driveExportsFileSchema.parse({ version: 1, exports: [] }),
  );
  const idx = file.exports.findIndex(
    (e) => e.kind === record.kind && e.source_ref === record.source_ref,
  );
  if (idx >= 0) file.exports[idx] = record;
  else file.exports.push(record);
  mkdirSync(join(getDataDir(), "integrations"), { recursive: true });
  writeYamlFile(exportsPath(), driveExportsFileSchema.parse(file));
}

/** Reject anything outside the human-facing docs allowlist (L2 guard). */
export function assertDocumentExportAllowed(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.includes("..")) {
    throw new Error("パスに .. は使えません");
  }
  const withoutPrefix = normalized.startsWith("docs/") ? normalized.slice(5) : normalized;
  if (!DOCUMENT_ALLOWLIST.some((prefix) => withoutPrefix.startsWith(prefix))) {
    throw new Error(
      `Drive へ出せるのは人が読む文書だけです（${DOCUMENT_ALLOWLIST.join(" · ")}）`,
    );
  }
  if (!withoutPrefix.endsWith(".md")) {
    throw new Error("Markdown 文書のみ PDF 化できます");
  }
  return withoutPrefix;
}

function pdfToBuffer(w: PdfWriter): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = new PassThrough();
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    w.doc.pipe(stream);
    w.doc.end();
  });
}

/** Markdown headings and bullets only — enough to stay readable on paper. */
function paintMarkdown(w: PdfWriter, markdown: string): void {
  const lines = markdown.split(/\r?\n/);
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length === 0) return;
    pdfBulletList(w, bullets);
    bullets = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]!);
      continue;
    }
    flushBullets();
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      pdfSection(w, heading[2]!);
      continue;
    }
    pdfParagraph(w, trimmed);
  }
  flushBullets();
}

export interface DrivePdfDocument {
  buffer: Buffer;
  fileName: string;
  sourceRef: string;
}

export async function buildDriveExportPdf(
  kind: DriveExportKind,
  id?: string,
): Promise<DrivePdfDocument> {
  if (kind === "receipt") {
    if (!id) throw new Error("receipt id required");
    const payload = loadSignedReceiptForPdf(id);
    return {
      buffer: await generateReceiptPdfBuffer(payload),
      fileName: `${id}.pdf`,
      sourceRef: id,
    };
  }

  if (kind === "document") {
    if (!id) throw new Error("document path required");
    const relative = assertDocumentExportAllowed(id);
    const absolute = join(getDocsDir(), relative);
    if (!existsSync(absolute)) throw new Error(`文書が見つかりません: docs/${relative}`);
    const w = createPdfWriter();
    pdfTitle(w, relative.split("/").pop()!.replace(/\.md$/, ""));
    pdfSubtitle(w, `OrgOS · ${getTenantId()} · docs/${relative}`);
    paintMarkdown(w, readFileSync(absolute, "utf-8"));
    pdfMutedNote(w, "正本は OrgOS 内の Markdown です。この PDF は閲覧用の写しです。");
    return {
      buffer: await pdfToBuffer(w),
      fileName: `${relative.replace(/\//g, "-").replace(/\.md$/, "")}.pdf`,
      sourceRef: `docs/${relative}`,
    };
  }

  if (kind === "work_order") {
    if (!id) throw new Error("work order id required");
    const handoff = loadHandoff(id);
    const w = createPdfWriter();
    pdfTitle(w, `${handoff.id} · ${handoff.subject ?? handoff.to_agent}`);
    pdfSubtitle(w, `OrgOS work order · ${getTenantId()}`);
    pdfSection(w, "概要");
    pdfBulletList(w, [
      `状態: ${handoff.status}`,
      `担当: ${handoff.to_agent}`,
      handoff.work_kind ? `種別: ${handoff.work_kind}` : "種別: 未分類",
      handoff.due_date ? `期限: ${handoff.due_date}` : "期限: なし",
    ]);
    if (handoff.deliverables.length > 0) {
      pdfSection(w, "成果物");
      pdfBulletList(w, handoff.deliverables);
    }
    if (handoff.acceptance_criteria.length > 0) {
      pdfSection(w, "受入基準");
      pdfBulletList(w, handoff.acceptance_criteria);
    }
    pdfMutedNote(w, "正本は OrgOS の routing-queue です。この PDF は閲覧用の写しです。");
    return {
      buffer: await pdfToBuffer(w),
      fileName: `${handoff.id}.pdf`,
      sourceRef: handoff.id,
    };
  }

  const tasks = loadExecutiveTasks().tasks.filter((t) => t.status !== "done");
  const w = createPdfWriter();
  pdfTitle(w, "社長タスク一覧");
  pdfSubtitle(w, `OrgOS · ${getTenantId()} · ${new Date().toISOString().slice(0, 10)}`);
  pdfBulletList(
    w,
    tasks.length > 0
      ? tasks.map((t) => `${t.id} · ${t.title}（${t.priority} / ${t.status}${t.due ? ` / ${t.due}` : ""}）`)
      : ["未完了のタスクはありません"],
  );
  pdfMutedNote(w, "正本は OrgOS の data/executive/tasks.yaml です。この PDF は閲覧用の写しです。");
  return {
    buffer: await pdfToBuffer(w),
    fileName: `executive-tasks-${new Date().toISOString().slice(0, 10)}.pdf`,
    sourceRef: "data/executive/tasks.yaml",
  };
}

/** Drive shares the Google OAuth client with Gmail (incremental scopes). */
async function resolveDriveAccessToken(fetchImpl: typeof fetch): Promise<string | null> {
  const token = loadConnectorToken("gdrive");
  if (!token) return null;
  if (!isConnectorTokenExpired(token)) return token.access_token;

  const cfg = getGmailOAuthClientConfig();
  if (!cfg || !token.refresh_token) return token.access_token;
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return token.access_token;
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return token.access_token;
  const refreshed = saveConnectorToken({
    ...token,
    access_token: body.access_token,
    expiry_date: body.expires_in ? Date.now() + body.expires_in * 1000 : token.expiry_date,
  });
  return refreshed.access_token;
}

export interface DriveExportResult {
  ok: boolean;
  reason?: string;
  file_id?: string;
  file_name?: string;
  folder_id?: string;
}

export async function exportToGoogleDrive(opts: {
  kind: DriveExportKind;
  id?: string;
  folderId?: string;
  operatorId?: string;
  fetchImpl?: typeof fetch;
}): Promise<DriveExportResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const accessToken = await resolveDriveAccessToken(fetchImpl);
  if (!accessToken) {
    return { ok: false, reason: "Google Drive が未接続です。連携設定から接続してください。" };
  }

  const folderId =
    opts.folderId?.trim() || loadConnectorSettings("gdrive")?.default_folder_id?.trim();
  if (!folderId) {
    return {
      ok: false,
      reason: "保存先フォルダが未設定です。連携設定でフォルダ ID を登録してください。",
    };
  }

  let document: DrivePdfDocument;
  try {
    document = await buildDriveExportPdf(opts.kind, opts.id);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  const boundary = `orgos-${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name: document.fileName, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
      "utf-8",
    ),
    document.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8"),
  ]);

  const res = await fetchImpl(DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) return { ok: false, reason: `drive_http_${res.status}` };
  const json = (await res.json()) as { id?: string; name?: string };
  if (!json.id) return { ok: false, reason: "drive_missing_file_id" };

  recordDriveExport(
    driveExportRecordSchema.parse({
      kind: opts.kind,
      source_ref: document.sourceRef,
      file_id: json.id,
      file_name: json.name ?? document.fileName,
      folder_id: folderId,
      exported_at: new Date().toISOString(),
      ...(opts.operatorId ? { exported_by: opts.operatorId } : {}),
    }),
  );

  return {
    ok: true,
    file_id: json.id,
    file_name: json.name ?? document.fileName,
    folder_id: folderId,
  };
}
