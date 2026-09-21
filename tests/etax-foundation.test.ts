import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  approveEtaxSubmission,
  cancelEtaxSubmission,
  assessEtaxSpecCatalog,
  EtaxSubmissionStore,
  prepareOfficialEtaxPackage,
  pollEtaxReceipt,
  recoverInterruptedEtaxSubmission,
  resolveEtaxSpec,
  sendEtaxSubmission,
  signEtaxSubmission,
  verifyEtaxSubmissionEvidence,
  writeOfficialEtaxXml,
} from "../src/lib/finance/etax.js";
import { sendEltaxPackage } from "../src/lib/finance/eltax.js";
import { CatalogEtaxFormMapper } from "../src/lib/finance/etax-form-mapper.js";
import { buildEtaxChildEnv, CommandEtaxTransport } from "../src/lib/finance/etax-command-adapters.js";
import type { EtaxSpecCatalog } from "../schemas/finance/etax.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "orgos-etax-"));
  const xsdPath = join(root, "official.xsd");
  const xmlPath = join(root, "return.xml");
  writeFileSync(xsdPath, "official-xsd-fixture");
  writeFileSync(xmlPath, "<OfficialReturn/>");
  const catalog: EtaxSpecCatalog = {
    schema: "orgos.jp.etax-spec-catalog.v1",
    updated_at: "2026-09-21T00:00:00.000Z",
    entries: [{
      id: "nta-consumption-2026-test", tax_type: "consumption_tax", procedure_id: "TEST-PROC",
      form_revision: "2026-test", effective_from: "2026-01-01",
      checked_at: "2026-09-20T00:00:00.000Z",
      source_url: "https://www.e-tax.nta.go.jp/shiyo/shiyo3.htm", xsd_path: "official.xsd",
      xsd_sha256: hash("official-xsd-fixture"), mapping_revision: "test-1",
      transmission_profile: "test-only", certified: true,
    }],
  };
  return { root, xmlPath, catalog };
}

describe("e-Tax official submission foundation", () => {
  it("requires encrypted storage in production", () => {
    const { root } = fixture();
    expect(() => new EtaxSubmissionStore(join(root, "state"), 10, { production: true, encryptedStorage: false }))
      .toThrow("requires encrypted storage");
    expect(() => new EtaxSubmissionStore(join(root, "state"), 10, { production: true, encryptedStorage: true }))
      .not.toThrow();
  });

  it("loads only hash-certified data-driven official mappings", () => {
    const { root, catalog } = fixture();
    const mappingPath = join(root, "mapping.json");
    const evidencePath = join(root, "certification.txt");
    const mapping = JSON.stringify({ schema: "orgos.jp.etax-form-mapping.v1", mapping_revision: "test-1",
      root_element: "OfficialReturn", namespace: "urn:nta:test", fields: [
        { element: "Amount", source: "filing.amount", required: true },
      ] });
    writeFileSync(mappingPath, mapping);
    writeFileSync(evidencePath, "connection-test-evidence");
    const mapper = new CatalogEtaxFormMapper({ mappingPath, mappingSha256: hash(mapping),
      certificationEvidencePath: evidencePath, certificationEvidenceSha256: hash("connection-test-evidence") });
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const outputPath = join(root, "official.xml");
    writeOfficialEtaxXml({ source: { filing: { amount: 123 } }, spec, mapper, outputPath });
    expect(readFileSync(outputPath, "utf8")).toContain("<Amount>123</Amount>");
    expect(() => new CatalogEtaxFormMapper({ mappingPath, mappingSha256: "0".repeat(64),
      certificationEvidencePath: evidencePath, certificationEvidenceSha256: hash("connection-test-evidence") }))
      .toThrow("hash mismatch");
  });
  it("detects stale and overlapping official specification entries", () => {
    const { catalog } = fixture();
    expect(assessEtaxSpecCatalog({ catalog, asOf: "2026-09-21T00:00:00.000Z" }).ready).toBe(true);
    catalog.entries.push({ ...catalog.entries[0]!, id: "overlap", checked_at: "2026-01-01T00:00:00.000Z" });
    const result = assessEtaxSpecCatalog({ catalog, asOf: "2026-09-21T00:00:00.000Z" });
    expect(result.errors[0]).toContain("overlapping");
    expect(result.warnings[0]).toContain("stale");
  });

  it("accepts output only from a certified mapper with the pinned revision", () => {
    const { root, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const outputPath = join(root, "mapped.xml");
    expect(() => writeOfficialEtaxXml({ allowUncertifiedTestDouble: true, source: {}, spec, outputPath, mapper: {
      name: "uncertified", mappingRevision: spec.mapping_revision, certified: false,
      map: () => "<Return/>",
    }})).toThrow("not certified");
    expect(() => writeOfficialEtaxXml({ allowUncertifiedTestDouble: true, source: {}, spec, outputPath, mapper: {
      name: "bad-draft", mappingRevision: spec.mapping_revision, certified: true,
      map: () => "<OrgOSCorporateTaxDraft/>",
    }})).toThrow("handoff draft");
    expect(() => writeOfficialEtaxXml({ source: {}, spec, outputPath, mapper: {
      name: "flag-only", mappingRevision: spec.mapping_revision, certified: true,
      map: () => "<OfficialReturn/>",
    }})).toThrow("hash-certified product adapter");
    const written = writeOfficialEtaxXml({ allowUncertifiedTestDouble: true, source: { amount: 100 }, spec, outputPath, mapper: {
      name: "certified-test", mappingRevision: spec.mapping_revision, certified: true,
      map: ({ source }) => `<OfficialReturn><Amount>${source.amount}</Amount></OfficialReturn>`,
    }});
    expect(readFileSync(written.path, "utf8")).toContain("<Amount>100</Amount>");
  });

  it("requires one certified, effective specification and a pinned XSD hash", () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture-xsd", validatorVersion: "1" }) });
    expect(pkg.payload_sha256).toBe(hash("<OfficialReturn/>"));
    catalog.entries[0]!.xsd_sha256 = "0".repeat(64);
    expect(() => prepareOfficialEtaxPackage({ spec: catalog.entries[0]!, fiscalYear: "FY2026", xmlPath,
      repositoryRoot: root, allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) }))
      .toThrow("XSD hash mismatch");
  });

  it("binds amended filings and attachments into the approved package hash", () => {
    const { root, xmlPath, catalog } = fixture();
    const attachmentPath = join(root, "attachment.pdf");
    writeFileSync(attachmentPath, "evidence-v1");
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      filingKind: "amended", priorReceiptNumber: "RCPT-OLD", attachments: [
        { documentId: "ATT-1", documentType: "supporting-schedule", path: attachmentPath },
      ], allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    const store = new EtaxSubmissionStore(join(root, "state"));
    let record = store.create(pkg, "idem-amended");
    record = store.transition(record.submission_id, "validated");
    writeFileSync(attachmentPath, "tampered");
    expect(() => approveEtaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-CEO", authorize: () => true }))
      .toThrow("attachment changed");
    expect(() => prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      filingKind: "corrected", allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) }))
      .toThrow("prior receipt");
  });

  it("binds approval and signature to the exact validated payload", async () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture-xsd", validatorVersion: "1" }) });
    const store = new EtaxSubmissionStore(join(root, "state"));
    let record = store.create(pkg, "idem-1");
    record = store.transition(record.submission_id, "validated");
    expect(() => approveEtaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-READONLY", authorize: () => false }))
      .toThrow("not authorized");
    record = approveEtaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-CEO", authorize: () => true });
    writeFileSync(xmlPath, "<Tampered/>");
    await expect(signEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, signer: {
      name: "test", certified: true, async sign() { return { algorithm: "test", certificateFingerprintSha256: "a".repeat(64), signaturePath: join(root, "signature") }; },
    }})).rejects.toThrow("payload hash mismatch");
  });

  it("is idempotent, saves receipt evidence, and resumes after transport failure", async () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture-xsd", validatorVersion: "1" }) });
    const store = new EtaxSubmissionStore(join(root, "state"));
    let record = store.create(pkg, "idem-2");
    expect(store.create(pkg, "idem-2").submission_id).toBe(record.submission_id);
    record = store.transition(record.submission_id, "validated");
    record = approveEtaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-CEO", authorize: () => true });
    record = await signEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, signer: {
      name: "test", certified: true, async sign() { const path = join(root, "signature"); writeFileSync(path, "sig"); return {
        algorithm: "test", certificateFingerprintSha256: "b".repeat(64), signaturePath: path }; },
    }});
    await expect(sendEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, transport: {
      name: "certified-test", certified: true, async send() { throw new Error("temporary outage"); },
    }})).rejects.toThrow("temporary outage");
    expect(store.get(record.submission_id).status).toBe("sending");
    await expect(sendEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, transport: {
      name: "certified-test", certified: true, async send() { return { requestId: "should-not-resend" }; },
    }})).rejects.toThrow("already sending");
    record = await recoverInterruptedEtaxSubmission({ store, submissionId: record.submission_id, transport: {
      name: "certified-test", certified: true, async send() { throw new Error("unused"); },
      async lookup() { return { status: "not_found" }; },
    }});
    expect(record.status).toBe("signed");
    record = await sendEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, transport: {
      name: "certified-test", certified: true, async send(input) { return { requestId: input.requestId, receipt: {
        receiptNumber: "RCPT-1", receivedAt: "2026-09-21T01:00:00.000Z", taxOffice: "テスト税務署",
        result: "accepted", xtx: Buffer.from("xtx-evidence"),
      }}; },
    }});
    expect(record.status).toBe("accepted");
    expect(record.receipt?.xtx_sha256).toBe(hash("xtx-evidence"));
    expect(readFileSync(record.receipt!.xtx_path!, "utf8")).toBe("xtx-evidence");
    expect(record.attempts).toHaveLength(2);
    expect(record.retention_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(verifyEtaxSubmissionEvidence(record, store.readAudit())).toEqual({ ok: true, errors: [] });
    const withoutApproval = store.readAudit().filter((row) => row.status !== "approved");
    expect(verifyEtaxSubmissionEvidence(record, withoutApproval).errors.join(" ")).toContain("missing approval");
    await expect(sendEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, transport: {
      name: "certified-test", certified: true, async send() { return { requestId: "again" }; },
    }})).rejects.toThrow("cannot be sent after accepted");
    writeFileSync(record.receipt!.xtx_path!, "tampered-receipt");
    expect(verifyEtaxSubmissionEvidence(record, store.readAudit()).errors).toContain("receipt .xtx evidence missing or hash mismatch");
  });

  it("rejects stale concurrent state writes", () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    const store = new EtaxSubmissionStore(join(root, "state"));
    const stale = store.create(pkg, "idem-concurrent");
    store.save({ ...stale, legal_hold: true });
    expect(() => store.save({ ...stale, legal_hold: false })).toThrow("stale e-Tax submission revision");
  });

  it("polls a later message-box receipt and reaches accepted", async () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    const store = new EtaxSubmissionStore(join(root, "state"));
    let record = store.create(pkg, "idem-poll");
    record = store.transition(record.submission_id, "validated");
    record = approveEtaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-CEO", authorize: () => true });
    record = await signEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, signer: {
      name: "test", certified: true, async sign() { const path = join(root, "poll-signature"); writeFileSync(path, "sig");
        return { algorithm: "test", certificateFingerprintSha256: "c".repeat(64), signaturePath: path }; },
    }});
    record = await sendEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, transport: {
      name: "test", certified: true, async send(input) { return { requestId: input.requestId }; },
    }});
    expect(record.status).toBe("received");
    record = await pollEtaxReceipt({ store, submissionId: record.submission_id, transport: {
      name: "test", certified: true, async send() { return { requestId: "unused" }; },
      async lookup() { return { status: "found", receipt: { receiptNumber: "RCPT-POLL",
        receivedAt: "2026-09-21T02:00:00.000Z", taxOffice: "テスト税務署", result: "accepted" } }; },
    }});
    expect(record.status).toBe("accepted");
    expect(record.receipt?.receipt_number).toBe("RCPT-POLL");
  });

  it("refuses an uncertified transport", async () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    const store = new EtaxSubmissionStore(join(root, "state"));
    const record = store.create(pkg, "idem-3");
    await expect(sendEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, transport: {
      name: "unsafe", certified: false, async send() { return { requestId: "never" }; },
    }})).rejects.toThrow("not certified");
  });

  it("cancels only before sending and preserves the reason", () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    const store = new EtaxSubmissionStore(join(root, "state"));
    const record = store.create(pkg, "idem-cancel");
    expect(() => cancelEtaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-X",
      reason: "withdraw", authorize: () => false })).toThrow("not authorized");
    const cancelled = cancelEtaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-CEO",
      reason: "replace return", authorize: () => true });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancellation?.reason).toBe("replace return");
  });

  it("reconciles an interrupted send before allowing retry", async () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    const store = new EtaxSubmissionStore(join(root, "state"));
    let record = store.create(pkg, "idem-crash");
    record = store.save({ ...record, status: "sending", attempts: [{
      attempted_at: "2026-09-21T01:00:00.000Z", request_id: "REQ-CRASH", outcome: "started",
    }] });
    record = await recoverInterruptedEtaxSubmission({ store, submissionId: record.submission_id, transport: {
      name: "certified", certified: true, async send() { throw new Error("unused"); },
      async lookup() { return { status: "not_found" }; },
    }});
    expect(record.status).toBe("signed");
    expect(record.attempts[0]?.outcome).toBe("failed");
  });

  it("keeps eLTAX packages and transports separate from e-Tax", async () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const etaxPackage = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    await expect(sendEltaxPackage({ package: etaxPackage, idempotencyKey: "x", transport: {
      name: "eltax-test", certified: true, async send() { return { requestId: "never" }; },
    }})).rejects.toThrow();
    const result = await sendEltaxPackage({ package: {
      schema: "orgos.jp.eltax-official-package.v1", package_id: "ELTAX-1", tax_type: "corporate_local_tax",
      municipality_code: "13101", procedure_id: "LOCAL-TEST", payload_path: xmlPath,
      payload_sha256: hash(readFileSync(xmlPath)), spec_id: "eltax-test", certified_at: "2026-09-21T00:00:00.000Z",
    }, idempotencyKey: "y", transport: {
      channel: "eltax", name: "eltax-test", certified: true, async send() { return { localReceiptNumber: "ELREQ-1" }; },
    }});
    expect(result.localReceiptNumber).toBe("ELREQ-1");
  });

  it("blocks XSD escape, package-key reuse, legal-hold release, and post-sign swaps", async () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    expect(() => prepareOfficialEtaxPackage({
      spec: { ...spec, xsd_path: "../official.xsd" }, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }),
    })).toThrow("escapes the repository root");
    const original = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    const amended = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      filingKind: "amended", priorReceiptNumber: "RCPT-PRIOR",
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    expect(amended.package_sha256).not.toBe(original.package_sha256);
    const store = new EtaxSubmissionStore(join(root, "state"));
    store.create(original, "idem-package");
    const amendedRecord = store.create(amended, "idem-amended-audit");
    expect(store.readAudit().some((row) => row.submission_id === amendedRecord.submission_id && row.prior_receipt_number === "RCPT-PRIOR")).toBe(true);
    expect(() => store.create(amended, "idem-package")).toThrow("different e-Tax package");
    const held = store.save({ ...store.create(original, "idem-hold"), legal_hold: true });
    expect(() => store.save({ ...held, legal_hold: false })).toThrow("legal hold cannot be cleared");
    catalog.entries.push({ ...catalog.entries[0]!, id: "ksk2-row", procedure_id: "OTHER",
      source_url: "https://www.e-tax.nta.go.jp/shiyo/ksk2/ksk2_shiyo.htm" });
    expect(assessEtaxSpecCatalog({ catalog, asOf: "2026-09-21T00:00:00.000Z" }).errors.join(" ")).toContain("KSK2");

    let record = store.create(original, "idem-swap");
    record = store.transition(record.submission_id, "validated");
    record = approveEtaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-CEO", authorize: () => true });
    record = await signEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, signer: {
      name: "test", certified: true, async sign() {
        const path = join(root, "swap-signature");
        writeFileSync(path, "sig");
        return { algorithm: "test", certificateFingerprintSha256: "d".repeat(64), signaturePath: path };
      },
    }});
    writeFileSync(record.signature!.signature_path, "other-sig");
    await expect(sendEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, transport: {
      name: "certified-test", certified: true, async send() { return { requestId: "should-not-send" }; },
    }})).rejects.toThrow("signature file changed");
    expect(store.get(record.submission_id).status).toBe("signed");
  });

  it("keeps sending when the module request id does not match and does not resend a found receipt", async () => {
    const { root, xmlPath, catalog } = fixture();
    const spec = resolveEtaxSpec({ catalog, taxType: "consumption_tax", filingDate: "2026-09-21" });
    const pkg = prepareOfficialEtaxPackage({ spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      allowUncertifiedTestDouble: true, validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }) });
    const store = new EtaxSubmissionStore(join(root, "state"));
    let record = store.create(pkg, "idem-request");
    record = store.transition(record.submission_id, "validated");
    record = approveEtaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-CEO", authorize: () => true });
    await expect(signEtaxSubmission({ store, submissionId: record.submission_id, signer: {
      name: "flag-only", certified: true, async sign() { throw new Error("unused"); },
    }})).rejects.toThrow("hash-certified product adapter");
    record = await signEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, signer: {
      name: "test", certified: true, async sign() {
        const path = join(root, "request-signature");
        writeFileSync(path, "sig");
        return { algorithm: "test", certificateFingerprintSha256: "e".repeat(64), signaturePath: path };
      },
    }});
    await expect(sendEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, transport: {
      name: "certified-test", certified: true, async send() { return { requestId: "other-request" }; },
    }})).rejects.toThrow("requestId");
    expect(store.get(record.submission_id).status).toBe("sending");
    expect(store.get(record.submission_id).receipt).toBeUndefined();
    const found = await recoverInterruptedEtaxSubmission({ store, submissionId: record.submission_id, transport: {
      name: "certified-test", certified: true, async send() { throw new Error("unused"); },
      async lookup() { return { status: "found", receipt: { receiptNumber: "RCPT-FOUND", receivedAt: "2026-09-21T03:00:00.000Z", taxOffice: "テスト税務署", result: "accepted" } }; },
    }});
    expect(found.status).toBe("accepted");
    await expect(sendEtaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: record.submission_id, transport: {
      name: "certified-test", certified: true, async send() { return { requestId: "again" }; },
    }})).rejects.toThrow("cannot be sent after accepted");
  });

  it("refuses secret child environment names without echoing the value", () => {
    const secret = "super-secret-value";
    expect(() => buildEtaxChildEnv({ USER_PIN: secret })).toThrow("forbidden secret variable name");
    try { buildEtaxChildEnv({ USER_PIN: secret }); } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).not.toContain(secret);
    }
    const env = buildEtaxChildEnv({ LD_PRELOAD: "injected", PATH: "/evil" });
    expect(env.LD_PRELOAD).toBeUndefined();
    expect(env.PATH).toBe(process.env.PATH ?? "");
    expect(() => new CommandEtaxTransport({
      executable: "/tmp/not-used", executableSha256: "a".repeat(64),
      certificationEvidencePath: "/tmp/not-used", certificationEvidenceSha256: "b".repeat(64),
    }, { API_TOKEN: secret })).toThrow("forbidden secret variable name");
  });
});
