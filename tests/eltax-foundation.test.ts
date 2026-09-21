import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { approveEltaxSubmission, EltaxSubmissionStore, recoverInterruptedEltaxSubmission, sendEltaxPackage, sendEltaxSubmission, signEltaxSubmission } from "../src/lib/finance/eltax.js";
import { prepareOfficialEtaxPackage } from "../src/lib/finance/etax.js";
import type { EtaxSpecCatalog } from "../schemas/finance/etax.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

describe("eLTAX submission separation", () => {
  it("keeps local-tax state, receipts, and transports away from e-Tax", async () => {
    const root = mkdtempSync(join(tmpdir(), "orgos-eltax-"));
    const xmlPath = join(root, "return.xml");
    writeFileSync(xmlPath, "<OfficialReturn/>");
    writeFileSync(join(root, "official.xsd"), "official-xsd-fixture");
    expect(() => new EltaxSubmissionStore(join(root, "etax"))).toThrow("e-Tax directory");
    const store = new EltaxSubmissionStore(join(root, "eltax-state"));
    const etaxPackage = {
      schema: "orgos.jp.etax-official-package.v1",
      package_id: "ETAX-PKG",
    };
    expect(() => store.create(etaxPackage, "idem-cross")).toThrow("e-Tax package");
    const pkg = {
      schema: "orgos.jp.eltax-official-package.v1", package_id: "ELTAX-1", tax_type: "corporate_local_tax",
      municipality_code: "13101", procedure_id: "LOCAL-TEST", payload_path: xmlPath,
      payload_sha256: hash("<OfficialReturn/>"), spec_id: "eltax-test", certified_at: "2026-09-21T00:00:00.000Z",
    };
    let legacySendCalled = false;
    await expect(sendEltaxPackage({
      package: pkg, idempotencyKey: "idem-transport",
      transport: { channel: "eltax", name: "legacy-transport", certified: true, async send() { legacySendCalled = true; return { requestId: "ELTAX-REQ", status: "accepted", localReceiptNumber: "MUST-NOT-SEND" }; } },
    })).rejects.toThrow("direct eLTAX package send is disabled");
    expect(legacySendCalled).toBe(false);
    const record = store.create(pkg, "idem-local");
    expect(record.status).toBe("prepared");
    expect("receipt" in record).toBe(false);
    expect("transition" in store).toBe(false);
    expect(() => store.save({ ...record, status: "approved" }, undefined as never)).toThrow("direct eLTAX state mutation is not allowed");
    const approved = approveEltaxSubmission({ store, submissionId: record.submission_id, operatorId: "OP-TEST", authorize: () => true });
    const signaturePath = join(root, "signature.xmlsig"); writeFileSync(signaturePath, "signed");
    const signed = await signEltaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: approved.submission_id, signer: { certified: true, async sign() { return { algorithm: "fixture", certificateFingerprintSha256: "b".repeat(64), signaturePath }; } } });
    const accepted = await sendEltaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: signed.submission_id, transport: { channel: "eltax", name: "fixture", certified: true, async send(input) { return { requestId: input.requestId, status: "accepted", localReceiptNumber: "LOCAL-RCPT-1" }; } } });
    expect(accepted.local_receipt_number).toBe("LOCAL-RCPT-1");
    expect(accepted).not.toHaveProperty("receipt");
    expect(store.verifyAudit()).toEqual([]);
    expect(await recoverInterruptedEltaxSubmission({ allowUncertifiedTestDouble: true, store, submissionId: accepted.submission_id, transport: { channel: "eltax", name: "fixture", certified: true, async send() { throw new Error("unused"); } } })).toEqual(accepted);
    const prod = new EltaxSubmissionStore(join(root, "eltax-production"), 10, { production: true, encryptedStorage: true });
    await expect(sendEltaxSubmission({ allowUncertifiedTestDouble: true, store: prod, submissionId: "never", transport: { channel: "eltax", name: "fixture", certified: true, async send() { throw new Error("unused"); } } })).rejects.toThrow("production eLTAX send is not enabled");
    const catalog: EtaxSpecCatalog = {
      schema: "orgos.jp.etax-spec-catalog.v1", updated_at: "2026-09-21T00:00:00.000Z",
      entries: [{
        id: "nta-consumption-2026-test", tax_type: "consumption_tax", procedure_id: "TEST-PROC",
        form_revision: "2026-test", effective_from: "2026-01-01", checked_at: "2026-09-20T00:00:00.000Z",
        source_url: "https://www.e-tax.nta.go.jp/shiyo/shiyo3.htm", xsd_path: "official.xsd",
        xsd_sha256: hash("official-xsd-fixture"), mapping_revision: "test-1",
        transmission_profile: "test-only", certified: true,
      }],
    };
    const spec = catalog.entries[0]!;
    expect(() => prepareOfficialEtaxPackage({
      spec, fiscalYear: "FY2026", xmlPath, repositoryRoot: root,
      validator: () => ({ valid: true, validatorName: "fixture", validatorVersion: "1" }),
      schema: "orgos.jp.eltax-official-package.v1",
    } as Parameters<typeof prepareOfficialEtaxPackage>[0])).toThrow("eLTAX package");
  });
});
