import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crc32 } from "node:zlib";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { digestBytes } from "../src/lib/document-digest.js";
import {
  asiceContainsPdfDigest,
  inspectAsiceContainer,
} from "../src/lib/pdf-esign/asice-lite.js";
import { mockSivaValidate } from "../src/lib/pdf-esign/siva-client.js";
import { getPdfEsignCasesPath } from "../src/lib/pdf-esign/paths.js";
import {
  findPdfEsignCase,
  insertPdfEsignCase,
  nextPdfEsignCaseId,
  updatePdfEsignCase,
} from "../src/lib/pdf-esign/case-store.js";

/** Minimal store-only ZIP writer — enough for the lite ASiC-E structural checks. */
function writeStoreZip(path: string, members: Array<{ name: string; data: Buffer }>): void {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const member of members) {
    const name = Buffer.from(member.name, "utf-8");
    const crc = crc32(member.data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(member.data.length, 18);
    local.writeUInt32LE(member.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, member.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(member.data.length, 20);
    central.writeUInt32LE(member.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + member.data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(path, Buffer.concat([...locals, centralBuf, end]));
}

describe("pdf esign — DigiDoc container inspection", () => {
  let dir = "";
  const pdf = Buffer.from("%PDF-1.7\nnational eID test\n", "utf-8");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "orgos-esign-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeContainer(name = "signed.asice"): string {
    const path = join(dir, name);
    writeStoreZip(path, [
      { name: "mimetype", data: Buffer.from("application/vnd.etsi.asic-e+zip", "utf-8") },
      { name: "contract.pdf", data: pdf },
      {
        name: "META-INF/signatures0.xml",
        data: Buffer.from("<XAdESSignatures/>", "utf-8"),
      },
    ]);
    return path;
  }

  it("accepts a well-formed container and finds the source PDF digest", () => {
    const lite = inspectAsiceContainer(writeContainer());
    expect(lite.ok).toBe(true);
    expect(lite.has_signature_meta).toBe(true);
    expect(asiceContainsPdfDigest(lite, digestBytes(pdf).content_digest)).toBe(true);
    expect(asiceContainsPdfDigest(lite, "0".repeat(64))).toBe(false);
  });

  it("rejects a container without META-INF", () => {
    const path = join(dir, "bad.asice");
    writeStoreZip(path, [
      { name: "mimetype", data: Buffer.from("application/vnd.etsi.asic-e+zip", "utf-8") },
      { name: "contract.pdf", data: pdf },
    ]);
    const lite = inspectAsiceContainer(path);
    expect(lite.ok).toBe(false);
    expect(lite.reason).toBe("missing_meta_inf");
  });

  it("mock SiVa never reports a national completion", () => {
    const passed = mockSivaValidate({ liteOk: true, pdfDigestOk: true });
    expect(passed.mode).toBe("mock");
    expect(passed.ok).toBe(true);

    const tampered = mockSivaValidate({ liteOk: true, pdfDigestOk: false });
    expect(tampered.ok).toBe(false);
    expect(tampered.indication).toBe("TOTAL-FAILED");
  });
});

describe("pdf esign case store", () => {
  beforeEach(() => {
    setTenantId("_fixture-books");
    rmSync(getPdfEsignCasesPath(), { force: true });
  });

  afterEach(() => {
    rmSync(getPdfEsignCasesPath(), { force: true });
  });

  it("allocates ids and applies patches", () => {
    const now = new Date().toISOString();
    const id = nextPdfEsignCaseId();
    expect(id).toMatch(/^ES-\d{4}-001$/);

    insertPdfEsignCase({
      id,
      title: "NDA",
      provider_id: "digidoc",
      pdf_path: "/tmp/contract.pdf",
      created_at: now,
      updated_at: now,
    });
    expect(findPdfEsignCase(id)?.status).toBe("draft");
    expect(nextPdfEsignCaseId()).toMatch(/^ES-\d{4}-002$/);

    const updated = updatePdfEsignCase(id, { status: "sent" });
    expect(updated.status).toBe("sent");
    expect(() => updatePdfEsignCase("ES-1999-001", { status: "sent" })).toThrow(
      /not found/,
    );
  });
});
