import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReturnPackage } from "../src/lib/etax/return-package.js";
import { generateOfficialXml } from "../src/lib/etax/xml-generator.js";
import { validateEtaxDocument } from "../src/lib/etax/validate-layers.js";
import { resolveOfficialXsd } from "../src/lib/etax/spec-fetch.js";
import { officialXsdAvailable } from "../src/lib/etax/spec-paths.js";
import {
  validateXmlAgainstXsd,
  xmlContentHash,
  xmlLintAvailable,
} from "../src/lib/etax/xml-validate.js";
import { statusAfterSuccessfulValidation } from "../src/lib/etax/lifecycle.js";
import { bindApprovalToSubmission } from "../src/lib/etax/approval.js";
import { bindSignatureToSubmission } from "../src/lib/etax/signature.js";
import { MockSignatureAdapter } from "../src/lib/etax/adapters.js";
import {
  markReadyToSubmit,
  pullReceipt,
  recoverInterruptedSubmission,
  replayIfAlreadySent,
  sendSignedSubmission,
} from "../src/lib/etax/submit.js";
import { transitionStatus } from "../src/lib/etax/state-machine.js";
import { ksk2SpecRegistered, requiredSpecDiskChecks } from "../src/lib/etax/spec-registry.js";
import { evaluateProductionEnablement } from "../src/lib/etax/production-review.js";
import { submissionSlotKey } from "../src/lib/etax/hash.js";
import type { EtaxSubmissionRecord } from "../src/lib/etax/store.js";
import { loadProcedureMapping } from "../src/lib/etax/xml-mapper.js";

const hasOfficial = officialXsdAvailable() && Boolean(loadProcedureMapping("RHO0010"));

function rhoPayload() {
  return {
    it: {
      zeimushoCd: "01101",
      zeimushoNm: "麹町",
      nozeishaId: "0000000000000001",
      nozeishaNm: "テスト株式会社",
      nozeishaAdr: "東京都千代田区麹町一丁目",
      procedureCd: "RHO0010",
      sakuseiDay: "2026-03-31",
    },
    hoa110: { teishutsuDay: "2026-03-31" },
  };
}

describe("etax RHO0010 official XML (Lane B)", () => {
  it("generates DATA/RHO0010/HOA110 from mapping and passes official XSD, or reports SPEC_BLOCKED", () => {
    const pkg = createReturnPackage(
      {
        taxpayerId: "TP-E2E-1",
        procedureCode: "RHO0010",
        taxYear: "FY2026",
        revision: 0,
        payload: rhoPayload(),
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-rho-e2e", now: "2026-09-21T00:00:00.000Z" }
    );
    const xml = generateOfficialXml(pkg);
    if (!hasOfficial || !xmlLintAvailable()) {
      const report = validateEtaxDocument({ pkg, xml, env: "mock" });
      expect(report.layers.find((row) => row.layer === "structural")?.status).toBe("SPEC_BLOCKED");
      return;
    }
    expect(xml).toContain("<DATA ");
    expect(xml).toContain("<RHO0010 ");
    expect(xml).toContain("<HOA110 ");
    expect(xml).toContain("<procedure_CD>RHO0010</procedure_CD>");
    const xsdPath = resolveOfficialXsd("hojin/RHO0010-150.xsd");
    expect(existsSync(xsdPath)).toBe(true);
    const xsd = validateXmlAgainstXsd(xml, xsdPath);
    expect(xsd).toEqual({ ok: true });
    const report = validateEtaxDocument({ pkg, xml, env: "mock" });
    expect(report.ok).toBe(true);
    expect(report.layers.every((row) => row.status === "pass")).toBe(true);
  });
});

describe("etax mock lifecycle without hand-placed xmlHash (Lane C)", () => {
  it("GENERATED → BUSINESS_RULE_VALID → APPROVED → SIGNED → RECEIVED_BY_ETAX", async () => {
    const pkg = createReturnPackage(
      {
        taxpayerId: "TP-E2E-2",
        procedureCode: "RHO0010",
        taxYear: "FY2026",
        revision: 0,
        payload: rhoPayload(),
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-rho-life", now: "2026-09-21T00:00:00.000Z" }
    );
    const xml = generateOfficialXml(pkg);
    if (!hasOfficial || !xmlLintAvailable()) {
      const blocked = validateEtaxDocument({ pkg, xml, env: "mock" });
      expect(blocked.layers.find((row) => row.layer === "structural")?.status).toBe("SPEC_BLOCKED");
      return;
    }
    const xmlHash = xmlContentHash(xml);
    const document = Buffer.from(xml, "utf-8");

    let sub: EtaxSubmissionRecord = {
      id: "ETAX-SUB-rho-life",
      packageId: pkg.id,
      status: "GENERATED",
      contentHash: pkg.contentHash,
      xmlHash,
      xmlProvenance: "generated",
      identityKey: submissionSlotKey({
        taxpayerId: pkg.taxpayerId,
        procedureCode: pkg.procedureCode,
        taxYear: pkg.taxYear,
        revision: pkg.revision,
      }),
      specVersion: pkg.specVersion,
    };

    const report = validateEtaxDocument({ pkg, submission: sub, xml, env: "mock" });
    expect(report.ok).toBe(true);
    expect(report.xmlHash).toBe(xmlHash);
    sub = { ...sub, status: statusAfterSuccessfulValidation(sub.status) };
    expect(sub.status).toBe("BUSINESS_RULE_VALID");

    sub = bindApprovalToSubmission(sub, {
      approvalId: "APR-E2E-001",
      contentHash: pkg.contentHash,
    });
    expect(sub.status).toBe("APPROVED");

    const signature = await new MockSignatureAdapter().sign({
      document,
      documentHash: xmlHash,
    });
    expect(signature.legal).toBe(false);
    sub = bindSignatureToSubmission(sub, signature, "mock");
    expect(sub.status).toBe("SIGNED");
    expect(sub.signatureLegal).toBe(false);
    expect(sub.signatureHash).toBe(signature.signatureHash);

    sub = markReadyToSubmit(sub, "mock");
    expect(sub.status).toBe("READY_TO_SUBMIT");

    const sent = await sendSignedSubmission({
      sub,
      env: "mock",
      document,
      signature: {
        provider: sub.signatureProvider!,
        legal: sub.signatureLegal!,
        certificateId: "orgos-mock-not-an-nta-certificate",
        certificateValid: false,
        signingTime: new Date(0).toISOString(),
        documentHash: sub.signatureDocumentHash as `sha256:${string}`,
        signatureHash: sub.signatureHash as `sha256:${string}`,
      },
    });
    expect(sent.submission.status).toBe("SUBMITTED");
    expect(sent.result.requestId?.startsWith("mock:")).toBe(true);

    const received = await pullReceipt({ sub: sent.submission, env: "mock" });
    expect(received.submission.status).toBe("RECEIVED_BY_ETAX");
    expect(received.receipt.receiptNumber?.startsWith("MOCK-NOT-NTA-")).toBe(true);
    expect(() => replayIfAlreadySent(received.submission)).toThrow(/RECEIVED_BY_ETAX/);
  });

  it("READY_TO_SUBMIT can transition to TRANSPORT_ERROR", () => {
    expect(transitionStatus("READY_TO_SUBMIT", "TRANSPORT_ERROR")).toBe("TRANSPORT_ERROR");
  });

  it("recovers an interrupted submit without inventing a receipt", () => {
    const sub = {
      id: "ETAX-SUB-recover",
      packageId: "ETAX-PKG-recover",
      status: "SUBMITTED",
      contentHash: "sha256:" + "ab".repeat(32),
      requestId: "req-recover",
      specVersion: "test",
      identityKey: "slot",
    } as EtaxSubmissionRecord;
    const unknown = recoverInterruptedSubmission(sub, {
      submissionId: sub.id,
      status: "UNKNOWN",
    });
    expect(unknown.submission.status).toBe("SUBMITTED");
    expect(unknown.escalate).toBe(true);
    const missing = recoverInterruptedSubmission(sub, {
      submissionId: sub.id,
      status: "TRANSPORT_ERROR",
      errorCode: "NOT_FOUND",
    });
    expect(missing.submission.status).toBe("SIGNED");
    expect(missing.resendAllowed).toBe(true);
  });
});

describe("etax production honesty (Lane A/E)", () => {
  it("reports required CAB disk checks and keeps production uncertified", () => {
    const checks = requiredSpecDiskChecks();
    expect(checks.some((row) => row.id === "e-tax19")).toBe(true);
    expect(checks.some((row) => row.id === "e-tax10")).toBe(true);
    const review = evaluateProductionEnablement();
    expect(review.certified).toBe(false);
    expect(review.production_submission_enabled).toBe(false);
    expect(review.blockers.length).toBeGreaterThan(0);
    // Registration requires on-disk SHA match for the required set — may be true after local fetch.
    expect(typeof ksk2SpecRegistered()).toBe("boolean");
  });
});

describe("etax XSD fixture path sanity", () => {
  it("keeps engine-only fixture under tests/fixtures", () => {
    expect(existsSync(join("tests/fixtures/etax/engine-only.xsd"))).toBe(true);
  });
});
