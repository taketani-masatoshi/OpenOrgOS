import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EtaxException } from "../schemas/etax/errors.js";
import {
  EtaxOfficialSignatureAdapter,
  resolveSignatureProviderId,
} from "../src/lib/etax/adapters.js";
import {
  ETAX_PRODUCTION_BANNER,
  ETAX_PRODUCTION_BANNER_CERTIFIED,
} from "../src/lib/etax/constants.js";
import { submissionSlotKey, sha256Digest } from "../src/lib/etax/hash.js";
import {
  ETAX_HOST_FORBIDDEN_REQUEST_IDS,
  StubEtaxHostClient,
  setEtaxHostClientForTests,
} from "../src/lib/etax/host-client.js";
import { checkInterFormRules } from "../src/lib/etax/inter-form.js";
import { loadProcedureMatrix } from "../src/lib/etax/procedures.js";
import { evaluateProductionEnablement } from "../src/lib/etax/production-review.js";
import { productionSubmitBlockedReasons } from "../src/lib/etax/production-gate.js";
import { parseReceiptXml, loadReceiptMapping } from "../src/lib/etax/receipt-mapping.js";
import { createReturnPackage } from "../src/lib/etax/return-package.js";
import { loadSignatureCatalog, officialSignatureHostBound } from "../src/lib/etax/signature-catalog.js";
import {
  EtaxOfficialTransport,
  resolveTransportProviderId,
} from "../src/lib/etax/transport.js";
import { loadTransportCatalog, officialTransportHostBound } from "../src/lib/etax/transport-catalog.js";
import { generateOfficialXml } from "../src/lib/etax/xml-generator.js";
import { officialXsdAvailable } from "../src/lib/etax/spec-paths.js";
import { resolveOfficialXsd } from "../src/lib/etax/spec-fetch.js";
import { validateXmlAgainstXsd, xmlLintAvailable } from "../src/lib/etax/xml-validate.js";
import { validateEtaxDocument } from "../src/lib/etax/validate-layers.js";
import { loadProcedureMapping } from "../src/lib/etax/xml-mapper.js";
import { bindApprovalToSubmission } from "../src/lib/etax/approval.js";
import type { EtaxProductionGate } from "../schemas/etax/production-gate.js";

afterEach(() => {
  setEtaxHostClientForTests(null);
});

const hasOfficial = officialXsdAvailable() && Boolean(loadProcedureMapping("RHO0010"));

function rhoPayload(extra?: Record<string, string>) {
  return {
    it: {
      zeimushoCd: "01101",
      zeimushoNm: "麹町",
      nozeishaId: "0000000000000001",
      nozeishaNm: "テスト株式会社",
      nozeishaAdr: "東京都千代田区麹町一丁目",
      procedureCd: "RHO0010",
      sakuseiDay: "2026-03-31",
      ...extra,
    },
  };
}

function certifiedGate(evidenceRel: string): EtaxProductionGate {
  return {
    schema_version: 1,
    production_submission_enabled: true,
    requirements: {
      ksk2_spec_registered: true,
      xml_schema_validation_proven: true,
      integration_tests_passed: true,
      nta_transmission_test_completed: true,
      production_credentials_configured: true,
      orgos_human_approval_recorded: true,
      production_feature_gate_released: true,
    },
    nta_transmission_test: {
      completed: true,
      evidence_path: evidenceRel,
      completed_at: "2026-09-21T00:00:00.000Z",
    },
  };
}

describe("T-A1 hostBound contract", () => {
  it("official signature stays SPEC_BLOCKED when catalog hostBound is false", async () => {
    expect(officialSignatureHostBound()).toBe(false);
    expect(loadSignatureCatalog().hostBound).toBe(false);
    try {
      await new EtaxOfficialSignatureAdapter().sign({
        document: Buffer.from("<x/>"),
        documentHash: sha256Digest(Buffer.from("<x/>")),
      });
      throw new Error("expected SPEC_BLOCKED");
    } catch (error) {
      expect(error).toBeInstanceOf(EtaxException);
      expect((error as EtaxException).etax.blocked).toBe("SPEC_BLOCKED");
      expect((error as EtaxException).etax.message).toMatch(/hostBound=false/);
    }
  });

  it("official transport stays SPEC_BLOCKED when catalog hostBound is false", async () => {
    expect(officialTransportHostBound()).toBe(false);
    expect(loadTransportCatalog().hostBound).toBe(false);
    try {
      await new EtaxOfficialTransport().submit({
        submissionId: "ETAX-SUB-cert",
        xml: Buffer.from("<x/>"),
        xmlHash: sha256Digest(Buffer.from("<x/>")),
        signature: {
          provider: "official",
          legal: true,
          certificateId: "x",
          certificateValid: true,
          signingTime: "2026-09-21T00:00:00.000Z",
          documentHash: sha256Digest(Buffer.from("<x/>")),
          signatureHash: sha256Digest("sig"),
        },
      });
      throw new Error("expected SPEC_BLOCKED");
    } catch (error) {
      expect((error as EtaxException).etax.blocked).toBe("SPEC_BLOCKED");
    }
  });

  it("forbids sample login request id XU00S010 from host", async () => {
    expect(ETAX_HOST_FORBIDDEN_REQUEST_IDS).toContain("XU00S010");
    const host = new StubEtaxHostClient({ requestId: "XU00S010" });
    try {
      await host.send({
        submissionId: "ETAX-SUB-x",
        document: Buffer.from("<x/>"),
        documentHash: sha256Digest(Buffer.from("<x/>")),
        signatureHash: sha256Digest("sig"),
      });
      throw new Error("expected forbidden request id");
    } catch (error) {
      expect(error).toBeInstanceOf(EtaxException);
      expect((error as EtaxException).etax.code).toBe("ETAX_HOST_FORBIDDEN_REQUEST_ID");
    }
  });

  it.skipIf(process.platform !== "win32" || !officialSignatureHostBound())(
    "Windows COM smoke when hostBound (operator / optional CI)",
    async () => {
      const health = await new StubEtaxHostClient().health();
      expect(health.methods).toEqual(
        expect.arrayContaining(["SignToReport", "Send", "GetResponse"]),
      );
    },
  );
});

describe("T-A2 mock isolation", () => {
  it("forbids mock signature outside --env mock", () => {
    expect(resolveSignatureProviderId("mock")).toBe("mock");
    try {
      resolveSignatureProviderId("test", "mock");
      throw new Error("expected refuse");
    } catch (error) {
      expect((error as EtaxException).etax.blocked).toBe("SPEC_BLOCKED");
    }
    try {
      resolveSignatureProviderId("production", "mock");
      throw new Error("expected refuse");
    } catch (error) {
      expect((error as EtaxException).etax.blocked).toBe("PRODUCTION_DISABLED");
    }
  });

  it("forbids mock transport outside --env mock", () => {
    try {
      resolveTransportProviderId("test", "mock");
      throw new Error("expected refuse");
    } catch (error) {
      expect((error as EtaxException).etax.blocked).toBe("SPEC_BLOCKED");
    }
  });
});

describe("T-A3 RHO0010 XSD", () => {
  it.skipIf(!hasOfficial || !xmlLintAvailable())(
    "generator output passes Layer1 (no hand-written XML)",
    () => {
      const pkg = createReturnPackage(
        {
          taxpayerId: "TP-CERT-1",
          procedureCode: "RHO0010",
          taxYear: "FY2026",
          revision: 0,
          payload: rhoPayload({ daihyoNm: "山田太郎" }),
          createdBy: "test",
          specVersion: "KSK2-2026-08-28",
        },
        { id: "ETAX-PKG-cert-rho", now: "2026-09-21T00:00:00.000Z" },
      );
      const xml = generateOfficialXml(pkg);
      expect(xml).toContain("<DAIHYO_NM ");
      const xsd = validateXmlAgainstXsd(xml, resolveOfficialXsd("hojin/RHO0010-150.xsd"));
      expect(xsd).toEqual({ ok: true });
    },
  );
});

describe("T-A4 Layer2 inter-form", () => {
  it("HOA110 passes via loaded e-tax08 rule", () => {
    const check = checkInterFormRules("HOA110");
    expect(check.status).toBe("pass");
    expect(check.detail).toMatch(/no form dependencies|No inter-form/);
  });

  it.skipIf(!hasOfficial || !xmlLintAvailable())("validate report.ok for RHO0010", () => {
    const pkg = createReturnPackage(
      {
        taxpayerId: "TP-CERT-2",
        procedureCode: "RHO0010",
        taxYear: "FY2026",
        revision: 0,
        payload: rhoPayload(),
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-cert-l2", now: "2026-09-21T00:00:00.000Z" },
    );
    const xml = generateOfficialXml(pkg);
    const report = validateEtaxDocument({ pkg, xml, env: "mock" });
    expect(report.ok).toBe(true);
  });
});

describe("T-A5 receipt map (e-tax18)", () => {
  it("extracts receiptNumber from structural fixture", () => {
    const mapping = loadReceiptMapping();
    expect(mapping.specArtifactId).toBe("e-tax18");
    expect(mapping.fields.some((f) => f.localName === "UMB00050")).toBe(true);
    const sample = `<?xml version="1.0"?><UMB00000><UMB00050>202609210001</UMB00050><UMB00070>RHO0010</UMB00070></UMB00000>`;
    const parsed = parseReceiptXml(sample);
    expect(parsed.receiptNumber).toBe("202609210001");
    expect(parsed.procedureName).toBe("RHO0010");
    expect(parsed.receiptNumber?.startsWith("MOCK-NOT-NTA-")).toBe(false);
  });

  it("fails closed on unknown receipt root (fix #8)", () => {
    try {
      parseReceiptXml(`<?xml version="1.0"?><NOTUMB><UMB00050>1</UMB00050></NOTUMB>`);
      throw new Error("expected refuse");
    } catch (error) {
      expect(error).toBeInstanceOf(EtaxException);
      expect((error as EtaxException).etax.code).toBe("ETAX_RECEIPT_XML_ROOT_MISMATCH");
    }
  });
});

describe("T-A6 slot / hash", () => {
  it("slot key is stable and independent of content hash input", () => {
    const a = submissionSlotKey({
      taxpayerId: "TP-1",
      procedureCode: "RHO0010",
      taxYear: "FY2026",
      revision: 0,
    });
    const b = submissionSlotKey({
      taxpayerId: "TP-1",
      procedureCode: "RHO0010",
      taxYear: "FY2026",
      revision: 0,
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("hash mutation invalidates approval binding", () => {
    const xml = Buffer.from("<data/>");
    const xmlHash = sha256Digest(xml);
    const contentHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const sub = {
      id: "ETAX-SUB-hash",
      packageId: "ETAX-PKG-hash",
      status: "BUSINESS_RULE_VALID" as const,
      contentHash,
      xmlHash,
      identityKey: "x",
      specVersion: "KSK2-2026-08-28",
    };
    const ok = bindApprovalToSubmission(sub, { approvalId: "APR-1", contentHash });
    expect(ok.status).toBe("APPROVED");
    try {
      bindApprovalToSubmission(sub, {
        approvalId: "APR-1",
        contentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      });
      throw new Error("expected hash mismatch");
    } catch (error) {
      expect((error as EtaxException).etax.blocked).toBe("HASH_MISMATCH");
    }
  });
});

describe("T-A7 production gate derivation", () => {
  it("repo tip gate is not certified", () => {
    const review = evaluateProductionEnablement();
    expect(review.certified).toBe(false);
    expect(review.banner).toBe(ETAX_PRODUCTION_BANNER);
  });

  it("missing evidence keeps certified false even if flags look complete", () => {
    const incomplete = certifiedGate("data/etax/transmission-test/does-not-exist.txt");
    expect(evaluateProductionEnablement(incomplete).certified).toBe(false);
  });

  it("temp evidence + full flags yields certified when live KSK2 registry matches", () => {
    const evidenceRel = join("data", "etax", "transmission-test", "_cert-fixture-evidence.txt");
    const abs = join(process.cwd(), evidenceRel);
    mkdirSync(join(process.cwd(), "data", "etax", "transmission-test"), { recursive: true });
    writeFileSync(abs, "fixture evidence — not real NTA completion\n");
    try {
      const gate = certifiedGate(evidenceRel);
      const blockers = productionSubmitBlockedReasons("production", gate);
      const review = evaluateProductionEnablement(gate);
      if (blockers.length === 0) {
        expect(review.certified).toBe(true);
        expect(review.banner).toBe(ETAX_PRODUCTION_BANNER_CERTIFIED);
      } else {
        expect(review.certified).toBe(false);
        expect(review.blockers.length).toBeGreaterThan(0);
      }
    } finally {
      writeFileSync(abs, "cleared\n");
    }
  });
});

describe("T-A8 ORGOS_ETAX_PRODUCTION=1", () => {
  it("env alone does not clear blockers", () => {
    const prev = process.env.ORGOS_ETAX_PRODUCTION;
    process.env.ORGOS_ETAX_PRODUCTION = "1";
    try {
      const reasons = productionSubmitBlockedReasons("production");
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons.some((r) => r.includes("ORGOS_ETAX_PRODUCTION=1 is ignored"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.ORGOS_ETAX_PRODUCTION;
      else process.env.ORGOS_ETAX_PRODUCTION = prev;
    }
  });
});

describe("T-A9 tax calculation boundary", () => {
  it("jp_tax module sources do not call etax submit helpers", () => {
    const roots = [
      "steward/jurisdiction-packs/JP/modules/jp_tax_corporate",
      "steward/jurisdiction-packs/JP/modules/jp_tax_consumption",
      "src/lib/tax",
      "src/commands/tax",
    ];
    const forbidden = [/submitToEtax/, /createTransportAdapter/, /etax production release/];
    for (const root of roots) {
      if (!existsSync(root)) continue;
      for (const file of walkFiles(root)) {
        if (!/\.(ts|js|md|yaml)$/.test(file)) continue;
        const text = readFileSync(file, "utf-8");
        for (const re of forbidden) {
          expect(text, file).not.toMatch(re);
        }
      }
    }
  });
});

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let names: string[];
    try {
      names = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name === "node_modules" || name === "vendor") continue;
      const p = join(cur, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out;
}

describe("T-A10 readiness / banner", () => {
  it("CERTIFIED banner is not shown while tip is uncertified", () => {
    const review = evaluateProductionEnablement();
    expect(review.certified).toBe(false);
    expect(review.banner).not.toMatch(/CERTIFIED \/ ENABLED/);
    expect(review.banner).toBe(ETAX_PRODUCTION_BANNER);
  });

  it("RHO0010 remains EXPERIMENTAL until operator promotion", () => {
    const matrix = loadProcedureMatrix();
    const row = matrix.procedures.find((p) => p.procedureCode === "RHO0010");
    expect(row?.support).toBe("EXPERIMENTAL");
    expect(row?.productionEligible).toBe(false);
  });

  it("when tip certified, D6/D7 must not contradict (regression)", async () => {
    const review = evaluateProductionEnablement();
    if (!review.certified) return;
    const { evaluateD6, evaluateD7 } = await import("../src/lib/etax/acceptance.js");
    expect(evaluateD6().ok).toBe(true);
    expect(evaluateD7().ok).toBe(true);
  });
});

describe("transmission evidence schema (A-layer structure)", () => {
  it("accepts structural T-O2 fixture and rejects MOCK prefix", async () => {
    const { etaxTransmissionEvidenceSchema } = await import(
      "../schemas/etax/transmission-evidence.js"
    );
    const ok = etaxTransmissionEvidenceSchema.parse({
      schema_version: 1,
      procedureCode: "RHO0010",
      env: "test",
      receiptNumber: "202609210001",
      requestId: "host:example-request",
      xmlHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      submittedAt: "2026-09-21T00:00:00.000Z",
      hostMethodsCalled: ["SignToReport", "Send", "GetResponse"],
    });
    expect(ok.receiptNumber).toBe("202609210001");
    expect(() =>
      etaxTransmissionEvidenceSchema.parse({
        ...ok,
        receiptNumber: "MOCK-NOT-NTA-deadbeef",
      }),
    ).toThrow();
  });
});

describe("stub host path", () => {
  it("stub host can SignToReport without inventing XU00S010", async () => {
    const host = new StubEtaxHostClient();
    const doc = Buffer.from("<data>x</data>");
    const hash = sha256Digest(doc);
    const signed = await host.signToReport({ document: doc, documentHash: hash });
    expect(signed.method).toBe("SignToReport");
    const sent = await host.send({
      submissionId: "ETAX-SUB-stub",
      document: doc,
      documentHash: hash,
      signatureHash: signed.signatureHash,
    });
    expect(sent.requestId).not.toBe("XU00S010");
    expect(sent.requestId.startsWith("host:")).toBe(true);
  });
});

describe("operator promotion refuses without D4", () => {
  it("promoteRho0010Supported is blocked on tip without NTA evidence", async () => {
    const { promoteRho0010Supported } = await import("../src/lib/etax/transmission-evidence-io.js");
    try {
      promoteRho0010Supported({ actor: "test" });
      throw new Error("expected refuse");
    } catch (error) {
      expect((error as EtaxException).etax.code).toBe("ETAX_PROMOTE_REQUIRES_D4");
    }
  });
});

describe("host bind refuses off Windows", () => {
  it("bindOfficialHostCatalogs fails on non-win32", async () => {
    if (process.platform === "win32") return;
    const { bindOfficialHostCatalogs } = await import("../src/lib/etax/host-bind.js");
    try {
      await bindOfficialHostCatalogs({ actor: "test", iUnderstandWindows: true });
      throw new Error("expected refuse");
    } catch (error) {
      expect((error as EtaxException).etax.code).toBe("ETAX_HOST_BIND_NOT_WINDOWS");
    }
  });
});

describe("fixes 1–16 A-layer contracts", () => {
  it("tip catalogs stay hostBound=false (fix #14 · Darwin-safe)", () => {
    expect(loadSignatureCatalog().hostBound).toBe(false);
    expect(loadTransportCatalog().hostBound).toBe(false);
    expect(officialSignatureHostBound()).toBe(false);
    expect(officialTransportHostBound()).toBe(false);
  });

  it("credential layout contract holds without inventing secrets (fix #6)", async () => {
    const { evaluateCredentialLayoutContract } = await import(
      "../src/lib/etax/credentials-contract.js"
    );
    const r = evaluateCredentialLayoutContract();
    expect(r.ok, r.blockers.join("; ")).toBe(true);
  });

  it("official receipt policy refuses MOCK-NOT-NTA- (fix #13)", async () => {
    const { officialReceiptRefusesMockPrefix, assertOfficialReceiptNumberNotMock } = await import(
      "../src/lib/etax/receipt-policy.js"
    );
    expect(officialReceiptRefusesMockPrefix("MOCK-NOT-NTA-deadbeef")).toBe(true);
    expect(() => assertOfficialReceiptNumberNotMock("MOCK-NOT-NTA-x")).toThrow(EtaxException);
  });

  it("isStubOrNonNtaHealth labels stub hosts (fix #1)", async () => {
    const { isStubOrNonNtaHealth, StubEtaxHostClient } = await import(
      "../src/lib/etax/host-client.js"
    );
    const health = await new StubEtaxHostClient().health();
    expect(isStubOrNonNtaHealth(health)).toBe(true);
  });

  it("B-layer suite is gated — unset ETAX_D18_ACCEPTANCE means not accepted (fix #4/#15)", () => {
    // This A-layer file always runs; B-layer file skips without the env flag.
    expect(process.env.ETAX_D18_ACCEPTANCE === "1").toBe(false);
    expect(evaluateProductionEnablement().certified).toBe(false);
  });

  it("D4 stays incomplete on tip without inventing NTA evidence (fix #5/#12)", async () => {
    const { evaluateD4 } = await import("../src/lib/etax/acceptance.js");
    const r = evaluateD4();
    expect(r.ok).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it("uncertified tip keeps ToS/commercial exclusion snippets (P1 D7 scanner)", async () => {
    const {
      ETAX_TOS_EXCLUSION_SNIPPET,
      ETAX_COMMERCIAL_EXCLUSION_SNIPPET,
      ETAX_TOS_RELATIVE_PATH,
      ETAX_COMMERCIAL_RELATIVE_PATH,
    } = await import("../src/lib/etax/constants.js");
    const tos = readFileSync(ETAX_TOS_RELATIVE_PATH, "utf-8");
    const commercial = readFileSync(ETAX_COMMERCIAL_RELATIVE_PATH, "utf-8");
    expect(evaluateProductionEnablement().certified).toBe(false);
    expect(tos).toContain(ETAX_TOS_EXCLUSION_SNIPPET);
    expect(tos.includes("RHO0010")).toBe(false);
    expect(commercial).toContain(ETAX_COMMERCIAL_EXCLUSION_SNIPPET);
    expect(commercial.includes("RHO0010")).toBe(false);
  });

  it("D3 code contracts hold while T-O2 evidence remains operator-blocked (P1 vs P3)", async () => {
    const { evaluateD3 } = await import("../src/lib/etax/acceptance.js");
    const { officialReceiptRefusesMockPrefix } = await import("../src/lib/etax/receipt-policy.js");
    const map = loadReceiptMapping();
    expect(map.specArtifactId).toBe("e-tax18");
    expect(officialReceiptRefusesMockPrefix("MOCK-NOT-NTA-x")).toBe(true);
    const r = evaluateD3();
    expect(r.ok).toBe(false);
    expect(r.blockers.some((b) => b.includes("transmission-test"))).toBe(true);
  });
});
