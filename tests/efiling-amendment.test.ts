import { describe, expect, it } from "vitest";
import { ETAX_PACKAGE_SCHEMA } from "../schemas/efiling/filing.js";
import { assertAuditBindsPriorReceipt, assertFilingKind } from "../src/lib/efiling/amendment.js";
import { hashFilingContent } from "../src/lib/efiling/hash.js";
import { FilingStore } from "../src/lib/efiling/store.js";

describe("efiling amended and corrected filings", () => {
  it("requires a prior receipt for amended and corrected, and forbids one on original", () => {
    expect(() => assertFilingKind({ filingKind: "amended" })).toThrow(/prior receipt/);
    expect(() => assertFilingKind({ filingKind: "corrected" })).toThrow(/prior receipt/);
    expect(() => assertFilingKind({ filingKind: "original", priorReceiptNumber: "RCPT" })).toThrow(/must not/);
    expect(() => assertFilingKind({ filingKind: "amended", priorReceiptNumber: "RCPT" })).not.toThrow();
  });

  it("binds the prior receipt into the hash and audit, without overwriting the original", () => {
    const originalHash = hashFilingContent(base());
    const amendedHash = hashFilingContent({ ...base(), filingKind: "amended", priorReceiptNumber: "RCPT-1" });
    expect(amendedHash).not.toBe(originalHash);
    expect(() =>
      assertAuditBindsPriorReceipt({
        filingKind: "amended",
        priorReceiptNumber: "RCPT-1",
        auditRows: [{ priorReceiptNumber: "OTHER" }],
      }),
    ).toThrow(/audit/);

    const store = new FilingStore({ channel: "etax", now: "2026-09-21T00:00:00.000Z" });
    const original = store.create(record("orig", "key-orig", 0));
    const amended = store.create({
      ...record("amended", "key-amended", 1),
      filingKind: "amended",
      priorReceiptNumber: "RCPT-1",
    });
    expect(amended.id).not.toBe(original.id);
    expect(store.get(original.id).status).toBe("DRAFT");
    expect(amended.audit[0]?.priorReceiptNumber).toBe("RCPT-1");
  });
});

function base() {
  return {
    taxpayerId: "TP",
    procedureCode: "EFILING-MOCK",
    taxYear: "FY2026",
    revision: 0,
    payload: { n: 1 },
    sourceReferences: [],
    specVersion: "test",
  };
}

function record(id: string, idempotencyKey: string, revision: number) {
  return {
    id: `EFILING-${id}`,
    packageId: `PKG-${id}`,
    taxpayerId: "TP",
    procedureCode: "EFILING-MOCK",
    taxYear: "FY2026",
    revision,
    payload: { n: 1 },
    sourceReferences: [],
    specVersion: "test",
    idempotencyKey,
    schema: ETAX_PACKAGE_SCHEMA,
  };
}
