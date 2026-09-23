import { describe, expect, it } from "vitest";
import { EtaxException } from "../schemas/etax/errors.js";
import type { EtaxProcedureMatrix } from "../schemas/etax/procedures.js";
import { createReturnPackage, recomputeContentHash } from "../src/lib/etax/return-package.js";
import { hashReturnPackageContent, submissionSlotKey } from "../src/lib/etax/hash.js";
import {
  canTransition,
  invalidateAfterContentChange,
  transitionStatus,
} from "../src/lib/etax/state-machine.js";
import { generateOfficialXml } from "../src/lib/etax/xml-generator.js";
import { assertProcedureAllowed } from "../src/lib/etax/procedures.js";
import { productionSubmitBlockedReasons } from "../src/lib/etax/production-gate.js";
import { loadEtaxSpecManifest } from "../src/lib/etax/spec-registry.js";
import { redactEtaxRecord } from "../src/lib/etax/redact.js";
import { buildReturnPackage } from "../src/lib/etax/lifecycle.js";
import { ETAX_PRODUCTION_BANNER } from "../src/lib/etax/constants.js";

const fixtureMatrix: EtaxProcedureMatrix = {
  schema_version: 1,
  specFamily: "ksk2",
  defaultSupport: "UNSUPPORTED",
  notes: "test only",
  procedures: [
    {
      procedureCode: "TEST-CORP",
      title: "fixture — not an NTA code",
      support: "EXPERIMENTAL",
      productionEligible: false,
    },
  ],
};

describe("etax ReturnPackage hash", () => {
  it("is stable for the same canonical content", () => {
    const pkg = createReturnPackage(
      {
        taxpayerId: "TP-1",
        procedureCode: "TEST-CORP",
        taxYear: "FY2026",
        revision: 0,
        payload: { amount: 1, nested: { b: 2, a: 1 } },
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-fixed", now: "2026-09-20T00:00:00.000Z" }
    );
    expect(pkg.contentHash).toBe(recomputeContentHash(pkg));
    const again = hashReturnPackageContent({
      taxpayerId: pkg.taxpayerId,
      procedureCode: pkg.procedureCode,
      taxYear: pkg.taxYear,
      revision: pkg.revision,
      payload: { nested: { a: 1, b: 2 }, amount: 1 },
      sourceReferences: [],
      specVersion: pkg.specVersion,
    });
    expect(again).toBe(pkg.contentHash);
  });

  it("changes when one payload byte changes", () => {
    const base = createReturnPackage(
      {
        taxpayerId: "TP-1",
        procedureCode: "TEST-CORP",
        taxYear: "FY2026",
        revision: 0,
        payload: { amount: 100 },
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-a", now: "2026-09-20T00:00:00.000Z" }
    );
    const mutated = createReturnPackage(
      {
        taxpayerId: "TP-1",
        procedureCode: "TEST-CORP",
        taxYear: "FY2026",
        revision: 0,
        payload: { amount: 101 },
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-a", now: "2026-09-20T00:00:00.000Z" }
    );
    expect(mutated.contentHash).not.toBe(base.contentHash);
  });
});

describe("etax state machine", () => {
  it("allows DRAFT → GENERATED and rejects DRAFT → SUBMITTED", () => {
    expect(canTransition("DRAFT", "GENERATED")).toBe(true);
    expect(() => transitionStatus("DRAFT", "SUBMITTED")).toThrow(EtaxException);
  });

  it("allows READY_TO_SUBMIT → TRANSPORT_ERROR", () => {
    expect(canTransition("READY_TO_SUBMIT", "TRANSPORT_ERROR")).toBe(true);
    expect(transitionStatus("READY_TO_SUBMIT", "TRANSPORT_ERROR")).toBe("TRANSPORT_ERROR");
  });

  it("invalidates approval-class states back to DRAFT on content change", () => {
    expect(invalidateAfterContentChange("APPROVED")).toBe("DRAFT");
    expect(invalidateAfterContentChange("SIGNED")).toBe("DRAFT");
    expect(invalidateAfterContentChange("READY_TO_SUBMIT")).toBe("DRAFT");
    expect(() => invalidateAfterContentChange("RECEIVED_BY_ETAX")).toThrow(EtaxException);
  });
});

describe("etax idempotency identity", () => {
  it("slot key is taxpayer, procedure, year, revision (no content hash)", () => {
    const a = submissionSlotKey({
      taxpayerId: "TP-1",
      procedureCode: "TEST-CORP",
      taxYear: "FY2026",
      revision: 0,
    });
    const b = submissionSlotKey({
      taxpayerId: "TP-1",
      procedureCode: "TEST-CORP",
      taxYear: "FY2026",
      revision: 0,
    });
    const c = submissionSlotKey({
      taxpayerId: "TP-1",
      procedureCode: "TEST-CORP",
      taxYear: "FY2026",
      revision: 1,
    });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});

describe("etax procedure fail-closed", () => {
  it("refuses unknown procedures", () => {
    expect(() => assertProcedureAllowed("HOC-UNKNOWN", "mock", fixtureMatrix)).toThrow(
      /not in the OpenOrgOS supported matrix/
    );
  });

  it("refuses EXPERIMENTAL in production", () => {
    expect(() => assertProcedureAllowed("TEST-CORP", "production", fixtureMatrix)).toThrow(
      /production requires SUPPORTED/
    );
  });
});

describe("etax XML generator", () => {
  it("is SPEC_BLOCKED until an official envelope mapping exists", () => {
    const pkg = createReturnPackage(
      {
        taxpayerId: "TP-1",
        procedureCode: "TEST-CORP",
        taxYear: "FY2026",
        revision: 0,
        payload: {},
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-xml", now: "2026-09-20T00:00:00.000Z" }
    );
    try {
      generateOfficialXml(pkg);
      throw new Error("expected SPEC_BLOCKED");
    } catch (error) {
      expect(error).toBeInstanceOf(EtaxException);
      expect((error as EtaxException).etax.blocked).toBe("SPEC_BLOCKED");
    }
  });
});

describe("etax production gate", () => {
  it("fail-closes production and ignores ORGOS_ETAX_PRODUCTION", () => {
    const previous = process.env.ORGOS_ETAX_PRODUCTION;
    process.env.ORGOS_ETAX_PRODUCTION = "1";
    try {
      const reasons = productionSubmitBlockedReasons("production");
      expect(reasons.length).toBeGreaterThan(0);
      expect(new Set(reasons).size).toBe(reasons.length);
      expect(reasons).toContain("production_submission_enabled=false");
      expect(reasons).toContain("production_feature_gate_released=false");
      expect(reasons.join(" ")).toMatch(/ORGOS_ETAX_PRODUCTION=1 is ignored/);
      expect(ETAX_PRODUCTION_BANNER).toContain("NOT CERTIFIED");
    } finally {
      if (previous === undefined) delete process.env.ORGOS_ETAX_PRODUCTION;
      else process.env.ORGOS_ETAX_PRODUCTION = previous;
    }
  });
});

describe("etax spec registry", () => {
  it("loads KSK2-only manifest", () => {
    const manifest = loadEtaxSpecManifest();
    expect(manifest.family).toBe("ksk2");
    expect(manifest.mix_legacy_specs).toBe(false);
    expect(manifest.baseline.listingUrl).toContain("/shiyo/ksk2/");
    expect(manifest.artifacts.some((row) => row.id === "e-tax19")).toBe(true);
  });
});

describe("etax secret redaction", () => {
  it("strips PIN and private keys from records", () => {
    const redacted = redactEtaxRecord({
      pin: "1234",
      password: "secret",
      note: "ok",
      pem: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----",
    });
    expect(JSON.stringify(redacted)).not.toContain("1234");
    expect(JSON.stringify(redacted)).not.toContain("secret");
    expect(JSON.stringify(redacted)).not.toContain("BEGIN PRIVATE KEY");
    expect(redacted.note).toBe("ok");
  });
});

describe("etax buildReturnPackage", () => {
  it("creates a DRAFT package without persisting when asked", () => {
    const pkg = buildReturnPackage(
      {
        taxpayerId: "TP-1",
        procedureCode: "TEST-CORP",
        taxYear: "FY2026",
        revision: 0,
        payload: { amount: 1 },
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { persist: false, procedureMatrix: fixtureMatrix }
    );
    expect(pkg.contentHash.startsWith("sha256:")).toBe(true);
  });

  it("allows DRAFT for unknown procedures; XML/submit stay fail-closed", () => {
    const pkg = buildReturnPackage(
      {
        taxpayerId: "TP-1",
        procedureCode: "HOC-UNKNOWN",
        taxYear: "FY2026",
        revision: 0,
        payload: {},
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { persist: false }
    );
    expect(pkg.procedureCode).toBe("HOC-UNKNOWN");
  });
});
