import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, copyFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addInboxItem,
  completeInboxItem,
  loadDocumentIo,
  registerOutboxItem,
  getIoStatus,
  initDocumentIoFile,
} from "../src/lib/document-io.js";
import { documentIoSchema } from "../schemas/document-io.js";

const IO_PATH = join(process.cwd(), "data/document-io.yaml");
const IO_BACKUP = join(tmpdir(), "steward-document-io-backup.yaml");

describe("document-io", () => {
  let tempDir: string;
  let samplePdf: string;
  const createdPaths: string[] = [];

  beforeEach(() => {
    initDocumentIoFile();
    copyFileSync(IO_PATH, IO_BACKUP);
    tempDir = mkdtempSync(join(tmpdir(), "steward-io-"));
    samplePdf = join(tempDir, "sample.pdf");
    writeFileSync(samplePdf, "%PDF-1.4 test");
    createdPaths.length = 0;
  });

  afterEach(() => {
    if (existsSync(IO_BACKUP)) {
      copyFileSync(IO_BACKUP, IO_PATH);
    }
    for (const p of createdPaths) {
      if (existsSync(join(process.cwd(), p))) {
        unlinkSync(join(process.cwd(), p));
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates empty document-io.yaml", () => {
    const data = loadDocumentIo();
    expect(documentIoSchema.parse(data)).toEqual(data);
    expect(data.inbox_items).toEqual([]);
  });

  it("registers inbox item with copy", () => {
    const item = addInboxItem({
      from: samplePdf,
      category: "licenses",
      title: "テスト許可証",
      relatedId: "CTR-013",
    });
    createdPaths.push(item.path);
    expect(item.id).toMatch(/^INB-\d{3}$/);
    expect(item.status).toBe("pending");
    expect(existsSync(join(process.cwd(), item.path))).toBe(true);
    expect(loadDocumentIo().inbox_items.some((i) => i.id === item.id)).toBe(true);
  });

  it("completes inbox with archive path", () => {
    const item = addInboxItem({
      from: samplePdf,
      category: "applications",
      title: "申請書テスト",
    });
    createdPaths.push(item.path);
    const archiveRel = `scratch/test-archive-${Date.now()}.pdf`;
    createdPaths.push(archiveRel);
    const done = completeInboxItem({
      id: item.id,
      archiveTo: archiveRel,
      notes: "processed",
    });
    expect(done.status).toBe("done");
    expect(done.archive_path).toBe(archiveRel);
    expect(existsSync(join(process.cwd(), archiveRel))).toBe(true);
  });

  it("registers outbox item without duplicate", () => {
    const outRel = `docs/io/outbox/lodging/test-out-${Date.now()}.pdf`;
    const outAbs = join(process.cwd(), outRel);
    mkdirSync(join(outAbs, ".."), { recursive: true });
    writeFileSync(outAbs, "%PDF out");
    createdPaths.push(outRel);

    const first = registerOutboxItem({
      from: outRel,
      category: "lodging",
      purpose: "display",
      copy: false,
    });
    const second = registerOutboxItem({
      from: outRel,
      category: "lodging",
      copy: false,
    });
    expect(first.id).toBe(second.id);
    expect(loadDocumentIo().outbox_items.filter((o) => o.path === first.path)).toHaveLength(1);
  });

  it("reports io status counts", () => {
    const status = getIoStatus();
    expect(status.inboxPending).toBeGreaterThanOrEqual(0);
    expect(status.outboxReady).toBeGreaterThanOrEqual(0);
  });
});
