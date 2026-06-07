import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { basename, extname, join, isAbsolute } from "node:path";
import {
  documentIoSchema,
  type DocumentIo,
  type InboxCategory,
  type InboxItem,
  type OutboxCategory,
  type OutboxItem,
} from "../../schemas/document-io.js";
import {
  DATA_DIR,
  DOCS_INBOX_DIR,
  DOCS_OUTBOX_DIR,
  currentDate,
  readYamlFile,
  writeYamlFile,
  resolveTenantPath,
  toLogicalPath,
} from "./utils.js";

const IO_PATH = join(DATA_DIR, "document-io.yaml");

function resolveIoPath(relOrAbs: string): string {
  return isAbsolute(relOrAbs) ? relOrAbs : resolveTenantPath(relOrAbs);
}

export const INBOX_CATEGORIES: InboxCategory[] = [
  "contracts",
  "licenses",
  "applications",
  "receipts",
  "corporate",
  "misc",
];

export const OUTBOX_CATEGORIES: OutboxCategory[] = [
  "corporate",
  "contracts",
  "lodging",
  "licenses",
  "submissions",
  "misc",
];

export function loadDocumentIo(): DocumentIo {
  if (!existsSync(IO_PATH)) {
    return { inbox_items: [], outbox_items: [] };
  }
  return readYamlFile(IO_PATH, documentIoSchema);
}

export function saveDocumentIo(data: DocumentIo): void {
  writeYamlFile(IO_PATH, data);
}

function nextId(prefix: "INB" | "OUT", items: { id: string }[]): string {
  const nums = items
    .map((i) => parseInt(i.id.replace(`${prefix}-`, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

function slugify(text: string): string {
  return text
    .trim()
    .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "document";
}

export function ensureInboxCategoryDir(category: InboxCategory): string {
  const dir = join(DOCS_INBOX_DIR, category);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureOutboxCategoryDir(category: OutboxCategory, subdir?: string): string {
  const dir = subdir ? join(DOCS_OUTBOX_DIR, category, subdir) : join(DOCS_OUTBOX_DIR, category);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface AddInboxOptions {
  from: string;
  category: InboxCategory;
  title: string;
  source?: InboxItem["source"];
  relatedId?: string;
  notes?: string;
}

export function addInboxItem(opts: AddInboxOptions): InboxItem {
  const src = resolveIoPath(opts.from);
  if (!existsSync(src)) {
    throw new Error(`Source file not found: ${opts.from}`);
  }

  const ext = extname(src) || ".pdf";
  const date = currentDate();
  const destName = `${date}_${slugify(opts.title)}${ext}`;
  const destDir = ensureInboxCategoryDir(opts.category);
  const destPath = join(destDir, destName);
  copyFileSync(src, destPath);

  const relPath = toLogicalPath(destPath);
  const data = loadDocumentIo();
  const item: InboxItem = {
    id: nextId("INB", data.inbox_items),
    filename: destName,
    path: relPath,
    category: opts.category,
    status: "pending",
    received_at: date,
    source: opts.source ?? "scan",
    title: opts.title,
    related_id: opts.relatedId,
    notes: opts.notes,
  };
  data.inbox_items.push(item);
  saveDocumentIo(data);
  return item;
}

export interface CompleteInboxOptions {
  id: string;
  archiveTo?: string;
  outputTo?: string;
  notes?: string;
}

export function completeInboxItem(opts: CompleteInboxOptions): InboxItem {
  const data = loadDocumentIo();
  const item = data.inbox_items.find((i) => i.id === opts.id);
  if (!item) throw new Error(`Inbox item not found: ${opts.id}`);

  const srcAbs = resolveIoPath(item.path);
  if (!existsSync(srcAbs)) {
    throw new Error(`Inbox file missing: ${item.path}`);
  }

  if (opts.archiveTo) {
    const archiveAbs = resolveIoPath(opts.archiveTo);
    mkdirSync(join(archiveAbs, ".."), { recursive: true });
    copyFileSync(srcAbs, archiveAbs);
    item.archive_path = toLogicalPath(archiveAbs);
  }

  if (opts.outputTo) {
    const outAbs = resolveIoPath(opts.outputTo);
    mkdirSync(join(outAbs, ".."), { recursive: true });
    copyFileSync(srcAbs, outAbs);
    item.output_path = toLogicalPath(outAbs);
    registerOutboxItem({
      from: item.output_path,
      category: inferOutboxCategory(opts.outputTo),
      purpose: "print",
      source: "inbox",
      sourceRef: item.id,
      title: item.title,
      relatedId: item.related_id,
      copy: false,
    });
  }

  item.status = "done";
  item.processed_at = currentDate();
  if (opts.notes) item.notes = [item.notes, opts.notes].filter(Boolean).join("\n");

  saveDocumentIo(data);
  return item;
}

function inferOutboxCategory(path: string): OutboxCategory {
  if (path.includes("/lodging/")) return "lodging";
  if (path.includes("/licenses/")) return "licenses";
  if (path.includes("/contracts/")) return "contracts";
  if (path.includes("/corporate/") || path.includes("/kessan/") || path.includes("/jigyo/"))
    return "corporate";
  if (path.includes("/submissions/")) return "submissions";
  return "misc";
}

export interface RegisterOutboxOptions {
  from: string;
  category: OutboxCategory;
  purpose?: OutboxItem["purpose"];
  source?: OutboxItem["source"];
  sourceRef?: string;
  title?: string;
  relatedId?: string;
  subdir?: string;
  notes?: string;
  copy?: boolean;
}

export function registerOutboxItem(opts: RegisterOutboxOptions): OutboxItem {
  const srcAbs = resolveIoPath(opts.from);
  if (!existsSync(srcAbs)) {
    throw new Error(`File not found: ${opts.from}`);
  }

  const ext = extname(srcAbs) || ".pdf";
  const base = basename(srcAbs, ext);
  const destDir = ensureOutboxCategoryDir(opts.category, opts.subdir);
  const destName = basename(srcAbs);
  const destAbs = join(destDir, destName);

  if (opts.copy !== false && srcAbs !== destAbs) {
    copyFileSync(srcAbs, destAbs);
  } else if (srcAbs !== destAbs) {
    renameSync(srcAbs, destAbs);
  }

  const relPath = toLogicalPath(destAbs);
  const data = loadDocumentIo();

  const existing = data.outbox_items.find((o) => o.path === relPath);
  if (existing) return existing;

  const item: OutboxItem = {
    id: nextId("OUT", data.outbox_items),
    filename: destName,
    path: relPath,
    category: opts.category,
    purpose: opts.purpose ?? "print",
    generated_at: currentDate(),
    source: opts.source ?? "manual",
    source_ref: opts.sourceRef,
    title: opts.title ?? base,
    related_id: opts.relatedId,
    notes: opts.notes,
  };
  data.outbox_items.push(item);
  saveDocumentIo(data);
  return item;
}

export function markOutboxPrinted(id: string): OutboxItem {
  const data = loadDocumentIo();
  const item = data.outbox_items.find((o) => o.id === id);
  if (!item) throw new Error(`Outbox item not found: ${id}`);
  item.printed_at = currentDate();
  saveDocumentIo(data);
  return item;
}

export function listPendingInbox(): InboxItem[] {
  return loadDocumentIo().inbox_items.filter(
    (i) => i.status === "pending" || i.status === "processing"
  );
}

export function listOutboxReady(): OutboxItem[] {
  return loadDocumentIo().outbox_items.filter((o) => !o.printed_at && !o.submitted_at);
}

export function scanOutboxFiles(): string[] {
  const files: string[] = [];
  if (!existsSync(DOCS_OUTBOX_DIR)) return files;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.pdf$/i.test(entry.name)) {
        files.push(toLogicalPath(full));
      }
    }
  };
  walk(DOCS_OUTBOX_DIR);
  return files.sort();
}

export interface IoStatusSummary {
  inboxPending: number;
  inboxProcessing: number;
  outboxReady: number;
  outboxFilesOnDisk: number;
  unregisteredOutboxFiles: string[];
}

export function getIoStatus(): IoStatusSummary {
  const data = loadDocumentIo();
  const onDisk = scanOutboxFiles();
  const registered = new Set(data.outbox_items.map((o) => o.path));
  return {
    inboxPending: data.inbox_items.filter((i) => i.status === "pending").length,
    inboxProcessing: data.inbox_items.filter((i) => i.status === "processing").length,
    outboxReady: listOutboxReady().length,
    outboxFilesOnDisk: onDisk.length,
    unregisteredOutboxFiles: onDisk.filter((f) => !registered.has(f)),
  };
}

export function formatIoStatus(summary: IoStatusSummary, data: DocumentIo): string {
  const lines = [
    "Document I/O ステータス",
    "",
    `  Inbox  未処理: ${summary.inboxPending} · 処理中: ${summary.inboxProcessing}`,
    `  Outbox 印刷待ち: ${summary.outboxReady} · ディスク上 PDF: ${summary.outboxFilesOnDisk}`,
  ];
  if (summary.unregisteredOutboxFiles.length) {
    lines.push("", "  ⚠ 未登録 PDF（`steward io outbox scan` で登録可）:");
    for (const f of summary.unregisteredOutboxFiles.slice(0, 8)) {
      lines.push(`    · ${f}`);
    }
  }
  const pending = data.inbox_items.filter((i) => i.status === "pending");
  if (pending.length) {
    lines.push("", "  Inbox 待ち:");
    for (const i of pending.slice(0, 5)) {
      lines.push(`    ${i.id}  ${i.title}  (${i.category})`);
    }
  }
  return lines.join("\n");
}

export function registerGeneratedPdf(
  absPath: string,
  category: OutboxCategory,
  sourceRef: string,
  subdir?: string
): OutboxItem {
  const rel = toLogicalPath(absPath);
  return registerOutboxItem({
    from: rel,
    category,
    subdir,
    source: "cli",
    sourceRef,
    purpose: category === "lodging" ? "display" : "print",
    copy: false,
  });
}

export function syncOutboxFromDisk(): OutboxItem[] {
  const added: OutboxItem[] = [];
  for (const path of getIoStatus().unregisteredOutboxFiles) {
    added.push(
      registerOutboxItem({
        from: path,
        category: inferOutboxCategory(path),
        source: "manual",
        copy: false,
      })
    );
  }
  return added;
}

export function initDocumentIoFile(): void {
  if (!existsSync(IO_PATH)) {
    saveDocumentIo({
      inbox_items: [],
      outbox_items: [],
      notes: "受信・出力トレイの台帳。`steward io` で操作。",
    });
  }
}
