import { describe, expect, it } from "vitest";
import { EtaxException } from "../schemas/etax/errors.js";
import { sha256Digest } from "../src/lib/etax/hash.js";
import { MockSignatureAdapter } from "../src/lib/etax/adapters.js";
import { bindApprovalToSubmission } from "../src/lib/etax/approval.js";
import {
  EtaxOfficialTransport,
  MockEtaxTransport,
  resolveTransportProviderId,
} from "../src/lib/etax/transport.js";
import { loadTransportCatalog, officialTransportHostBound } from "../src/lib/etax/transport-catalog.js";
import { bindSignatureToSubmission } from "../src/lib/etax/signature.js";
import {
  markReadyToSubmit,
  pullReceipt,
  replayIfAlreadySent,
  sendSignedSubmission,
} from "../src/lib/etax/submit.js";
import {
  assertProductionEnableRefused,
  evaluateProductionEnablement,
} from "../src/lib/etax/production-review.js";
import { productionSubmitBlockedReasons } from "../src/lib/etax/production-gate.js";
import type { EtaxSubmissionRecord } from "../src/lib/etax/store.js";

const xml = Buffer.from(`<?xml version="1.0"?><data>mock-not-nta</data>`, "utf-8");
const xmlHash = sha256Digest(xml);
const contentHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function submission(overrides?: Partial<EtaxSubmissionRecord>): EtaxSubmissionRecord {
  return {
    id: "ETAX-SUB-phase48",
    packageId: "ETAX-PKG-phase48",
    status: "BUSINESS_RULE_VALID",
    contentHash,
    xmlHash,
    identityKey: "identity",
    specVersion: "KSK2-2026-08-28",
    ...overrides,
  };
}

describe("etax transport catalog (e-tax04)", () => {
  it("catalogues official Send and leaves the native host unbound", () => {
    const catalog = loadTransportCatalog();
    expect(catalog.specArtifactId).toBe("e-tax04");
    expect(catalog.hostBound).toBe(false);
    expect(officialTransportHostBound(catalog)).toBe(false);
    expect(catalog.windows.progid).toBe("nta.CLCCommunication");
    expect(catalog.windows.submitMethod).toBe("Send");
    expect(catalog.windows.receiptMethod).toBe("GetResponse");
    expect(catalog.windows.methods).toContain("CreateRequest");
  });
});

describe("etax mock transport", () => {
  it("sends a labeled mock request that is not NTA transmission", async () => {
    const signature = await new MockSignatureAdapter().sign({ document: xml, documentHash: xmlHash });
    const result = await new MockEtaxTransport().submit({
      submissionId: "ETAX-SUB-phase48",
      xml,
      xmlHash,
      signature,
    });
    expect(result.ok).toBe(true);
    expect(result.transportStatus).toBe("sent");
    expect(result.requestId?.startsWith("mock:")).toBe(true);
    expect(result.message).toMatch(/Not NTA transmission/);
  });

  it("returns a mock receipt prefixed so it cannot be mistaken for NTA", async () => {
    const receipt = await new MockEtaxTransport().getReceipt("ETAX-SUB-phase48");
    expect(receipt.status).toBe("RECEIVED_BY_ETAX");
    expect(receipt.receiptNumber?.startsWith("MOCK-NOT-NTA-")).toBe(true);
  });
});

describe("etax official transport", () => {
  it("refuses to invent HTTP endpoints when the NTA host is unbound", async () => {
    try {
      await new EtaxOfficialTransport().submit();
      throw new Error("expected SPEC_BLOCKED");
    } catch (error) {
      expect(error).toBeInstanceOf(EtaxException);
      const etax = (error as EtaxException).etax;
      expect(etax.blocked).toBe("SPEC_BLOCKED");
      expect(etax.message).toMatch(/nta\.CLCCommunication/);
      expect(etax.message).toMatch(/Send/);
    }
  });
});

describe("etax transport provider selection", () => {
  it("forbids mock transport outside --env mock", () => {
    expect(resolveTransportProviderId("mock")).toBe("mock");
    expect(resolveTransportProviderId("test")).toBe("official");
    try {
      resolveTransportProviderId("production", "mock");
    } catch (error) {
      expect((error as EtaxException).etax.blocked).toBe("PRODUCTION_DISABLED");
    }
  });
});

describe("etax hash-bound approval", () => {
  it("moves BUSINESS_RULE_VALID → APPROVED when contentHash matches", () => {
    const next = bindApprovalToSubmission(submission(), {
      approvalId: "APR-20260921-001",
      contentHash,
    });
    expect(next.status).toBe("APPROVED");
    expect(next.approvalContentHash).toBe(contentHash);
  });

  it("refuses approval when the hash or status does not match", () => {
    expect(() =>
      bindApprovalToSubmission(submission({ status: "DRAFT" }), {
        approvalId: "APR-20260921-001",
        contentHash,
      })
    ).toThrow(/BUSINESS_RULE_VALID/);
    expect(() =>
      bindApprovalToSubmission(submission(), {
        approvalId: "APR-20260921-001",
        contentHash: sha256Digest("stale"),
      })
    ).toThrow(EtaxException);
  });
});

describe("etax submit idempotency and receipts", () => {
  it("walks SIGNED → READY → SUBMITTED → RECEIVED_BY_ETAX on mock and refuses a second send after receipt", async () => {
    const signature = await new MockSignatureAdapter().sign({ document: xml, documentHash: xmlHash });
    const approved = bindApprovalToSubmission(submission(), {
      approvalId: "APR-20260921-001",
      contentHash,
    });
    const signed = bindSignatureToSubmission(approved, signature, "mock");
    const ready = markReadyToSubmit(signed, "mock");
    expect(ready.status).toBe("READY_TO_SUBMIT");
    const sent = await sendSignedSubmission({
      sub: ready,
      env: "mock",
      document: xml,
      signature,
    });
    expect(sent.submission.status).toBe("SUBMITTED");
    expect(sent.result.requestId).toBeTruthy();
    const replay = await sendSignedSubmission({
      sub: sent.submission,
      env: "mock",
      document: xml,
      signature,
    });
    expect(replay.result.requestId).toBe(sent.result.requestId);
    const received = await pullReceipt({ sub: sent.submission, env: "mock" });
    expect(received.submission.status).toBe("RECEIVED_BY_ETAX");
    expect(received.receipt.receiptNumber?.startsWith("MOCK-NOT-NTA-")).toBe(true);
    expect(() => replayIfAlreadySent(received.submission)).toThrow(/RECEIVED_BY_ETAX/);
  });

  it("keeps production submit fail-closed", async () => {
    const signature = await new MockSignatureAdapter().sign({ document: xml, documentHash: xmlHash });
    await expect(
      sendSignedSubmission({
        sub: submission({ status: "READY_TO_SUBMIT", signatureRef: "mock:x", signatureProvider: "mock" }),
        env: "production",
        document: xml,
        signature,
      })
    ).rejects.toMatchObject({ etax: { blocked: "PRODUCTION_DISABLED" } });
  });
});

describe("etax production review (Phase 7–8)", () => {
  it("reports NTA transmission test not completed and refuses CLI enable", () => {
    const review = evaluateProductionEnablement();
    expect(review.certified).toBe(false);
    expect(review.production_submission_enabled).toBe(false);
    expect(review.nta_transmission_test.completed).toBe(false);
    expect(review.nta_transmission_test.evidence_present).toBe(false);
    expect(review.blockers.join(" ")).toMatch(/nta_transmission_test_completed=false/);
    expect(productionSubmitBlockedReasons("production").join(" ")).toMatch(
      /production_submission_enabled=false/
    );
    expect(() => assertProductionEnableRefused()).toThrow(EtaxException);
  });
});
