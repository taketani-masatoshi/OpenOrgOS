import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ETAX_PACKAGE_SCHEMA } from "../schemas/efiling/filing.js";
import { verifyFilingEvidence } from "../src/lib/efiling/evidence.js";
import { filingSha256Digest } from "../src/lib/efiling/hash.js";
import { FilingStore } from "../src/lib/efiling/store.js";

describe("efiling evidence and retention", () => {
  it("detects a tampered receipt and accepts matching hashes", () => {
    const dir = mkdtempSync(join(tmpdir(), "efiling-evidence-"));
    const xmlPath = join(dir, "return.xml");
    const signaturePath = join(dir, "return.sig");
    const xtxPath = join(dir, "receipt.xtx");
    writeFileSync(xmlPath, "<xml/>");
    writeFileSync(signaturePath, "sig");
    writeFileSync(xtxPath, "receipt");
    const ok = verifyFilingEvidence({
      status: "RECEIVED_BY_ETAX",
      xmlPath,
      xmlSha256: filingSha256Digest("<xml/>"),
      signaturePath,
      signatureSha256: filingSha256Digest("sig"),
      xtxPath,
      xtxSha256: filingSha256Digest("receipt"),
    });
    expect(ok.ok).toBe(true);
    writeFileSync(xtxPath, "tampered");
    const bad = verifyFilingEvidence({
      status: "RECEIVED_BY_ETAX",
      xmlPath,
      xmlSha256: filingSha256Digest("<xml/>"),
      signaturePath,
      signatureSha256: filingSha256Digest("sig"),
      xtxPath,
      xtxSha256: filingSha256Digest("receipt"),
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/xtx/);
  });

  it("refuses to shorten retention or release legal hold", () => {
    const store = new FilingStore({
      channel: "etax",
      now: "2026-09-21T00:00:00.000Z",
      retentionYears: 10,
    });
    const created = store.create({
      id: "EFILING-ev",
      packageId: "PKG-ev",
      taxpayerId: "TP",
      procedureCode: "EFILING-MOCK",
      taxYear: "FY2026",
      revision: 0,
      payload: { n: 1 },
      sourceReferences: [],
      specVersion: "test",
      idempotencyKey: "key-ev",
      schema: ETAX_PACKAGE_SCHEMA,
    });
    expect(created.retentionUntil.startsWith("2036-")).toBe(true);
    expect(() =>
      store.save({ ...created, retentionUntil: "2027-01-01" }, created.writeRevision),
    ).toThrow(/shortened/);
    const held = store.save({ ...created, legalHold: true }, created.writeRevision);
    expect(() => store.save({ ...held, legalHold: false }, held.writeRevision)).toThrow(/legal_hold/);
  });
});
