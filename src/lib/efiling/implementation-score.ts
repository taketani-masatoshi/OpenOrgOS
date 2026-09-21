import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  implementationScoreItemIds,
  type ImplementationScoreItemId,
} from "../../../schemas/efiling/filing.js";
import { ELTAX_PACKAGE_SCHEMA, ETAX_PACKAGE_SCHEMA } from "../../../schemas/efiling/filing.js";
import { FilingException } from "./errors.js";
import { assertFilingKind } from "./amendment.js";
import { assertTransportChannel, assertSignatureChannel, assertSpecChannel } from "./channel.js";
import { assertMockProviderForbidden } from "./lifecycle.js";
import { runMockFilingLifecycle } from "./lifecycle.js";
import { FilingStore } from "./store.js";
import { recoverInFlightFiling } from "./recovery.js";
import { getInstallRoot } from "../orgos-paths.js";
import { officialXsdAvailable } from "../etax/spec-paths.js";
import { loadProcedureMapping } from "../etax/xml-mapper.js";
import { assertRegisteredFormField, generateOfficialXml } from "../etax/xml-generator.js";
import { validateEtaxDocument } from "../etax/validate-layers.js";
import { xmlLintAvailable, validateXmlAgainstXsd } from "../etax/xml-validate.js";
import { resolveOfficialXsd, defaultEtaxSpecFetchIds } from "../etax/spec-fetch.js";
import { ETAX_REQUIRED_SPEC_ARTIFACT_IDS } from "../etax/constants.js";
import { createReturnPackage } from "../etax/return-package.js";
import { returnPackageFromTaxAdjustment } from "../etax/return-package-from-accounting.js";
import { evaluateProductionEnablement } from "../etax/production-review.js";
import { assertEltaxProcedureAllowed } from "../eltax/procedures.js";
import { assertCertifiedCommand, buildFilingChildEnv } from "./certified-adapter.js";

export type ImplementationScoreItem = {
  id: ImplementationScoreItemId;
  pass: boolean;
  reason: string;
};

export type ImplementationScore = {
  ok: boolean;
  passed: number;
  total: number;
  items: ImplementationScoreItem[];
  /** Lane 2 (D1–D8 / NTA certification) is never implied by this score. */
  lane2Certified: boolean;
  productionSubmission: "NOT CERTIFIED / DISABLED";
};

function item(id: ImplementationScoreItemId, pass: boolean, reason: string): ImplementationScoreItem {
  return { id, pass, reason: pass ? "ok" : reason };
}

function probe(id: ImplementationScoreItemId, fn: () => string | undefined): ImplementationScoreItem {
  try {
    const reason = fn();
    return item(id, !reason, reason ?? "ok");
  } catch (error) {
    return item(id, false, error instanceof Error ? error.message : String(error));
  }
}

function readRepo(relativePath: string): string {
  return readFileSync(join(getInstallRoot(), relativePath), "utf-8");
}

function rhoPackage() {
  return createReturnPackage(
    {
      taxpayerId: "TP-SCORE",
      procedureCode: "RHO0010",
      taxYear: "FY2026",
      revision: 0,
      createdBy: "efiling-score",
      payload: {
        it: {
          zeimushoCd: "01101",
          zeimushoNm: "麹町",
          nozeishaId: "0000000000000001",
          nozeishaNm: "スコア株式会社",
          nozeishaAdr: "東京都千代田区",
          procedureCd: "RHO0010",
          sakuseiDay: "2026-03-31",
        },
        hoa110: { teishutsuDay: "2026-03-31" },
      },
      specVersion: "KSK2-2026-08-28",
    },
    { id: "ETAX-PKG-score-m2", now: "2026-09-21T00:00:00.000Z" },
  );
}

export function evaluateImplementationScore(): ImplementationScore {
  // These environment variables must not be able to force a pass.
  void process.env.ORGOS_EFILING_FORCE_OK;
  void process.env.ORGOS_ETAX_PRODUCTION;

  const items: ImplementationScoreItem[] = [
    probe("M1", () => {
      for (const channel of ["etax", "eltax"] as const) {
        const record = runMockFilingLifecycle({
          channel,
          id: `EFILING-${channel}-m1`,
          packageId: `PKG-${channel}-m1`,
          taxpayerId: "TP-M1",
          procedureCode: "EFILING-MOCK",
          taxYear: "FY2026",
          revision: 0,
          payload: { marker: channel },
          specVersion: "score",
          idempotencyKey: `idem-${channel}`,
          now: "2026-09-21T00:00:00.000Z",
        });
        if (record.status !== "RECEIVED_BY_ETAX" || !record.receiptNumber) {
          return `${channel} mock lifecycle did not reach receipt`;
        }
        if (record.contentHash.length < 10) return "content hash was not derived";
      }
      return undefined;
    }),
    probe("M2", () => {
      const mapping = loadProcedureMapping("RHO0010");
      const body = mapping?.forms?.find((row) => row.formId === "HOA110");
      const required = body?.fields.filter((row) => row.required) ?? [];
      if (required.length === 0) return "SPEC_BLOCKED: HOA110 body fields are not registered";
      if (!officialXsdAvailable() || !xmlLintAvailable()) {
        return "SPEC_BLOCKED: official e-tax19 XSD or xmllint is not available";
      }
      const pkg = rhoPackage();
      const xml = generateOfficialXml(pkg);
      if (/<HOA110[^>]*\/>/.test(xml)) return "HOA110 was emitted as an empty tag";
      if (!xml.includes("<AAA00010 ")) return "registered HOA110 field AAA00010 was not emitted";
      const xsd = validateXmlAgainstXsd(xml, resolveOfficialXsd("hojin/RHO0010-150.xsd"));
      if (!xsd.ok) return `SPEC_BLOCKED: Layer1 XSD failed: ${xsd.output}`;
      return undefined;
    }),
    probe("M3", () => {
      try {
        assertRegisteredFormField("RHO0010", "HOA410");
        return "unregistered form HOA410 was accepted";
      } catch (error) {
        if (error instanceof Error && "etax" in error) {
          const blocked = (error as { etax: { blocked?: string } }).etax.blocked;
          if (blocked !== "SPEC_BLOCKED") return "unregistered form did not fail closed";
        } else {
          return "unregistered form did not fail closed";
        }
      }
      try {
        assertRegisteredFormField("RHO0010", "HOA110", "NOT_A_FIELD");
        return "unregistered field was accepted";
      } catch (error) {
        if (!(error instanceof Error) || !("etax" in error)) return "unregistered field did not fail closed";
      }
      return undefined;
    }),
    probe("M4", () => {
      const workflow = readRepo(".github/workflows/validate.yml");
      if (!workflow.includes("libxml2-utils")) return "CI does not install xmllint";
      for (const relative of ["tests/etax-phase2.test.ts", "tests/etax-lifecycle-e2e.test.ts"]) {
        const source = readRepo(relative);
        if (source.includes("skipIf(!hasOfficial")) return `${relative} still skips official XSD silently`;
        if (!source.includes("SPEC_BLOCKED")) return `${relative} does not assert SPEC_BLOCKED`;
      }
      const pkg = rhoPackage();
      const xml = generateOfficialXml(pkg);
      const report = validateEtaxDocument({ pkg, xml, env: "mock" });
      const structural = report.layers.find((row) => row.layer === "structural");
      if (!officialXsdAvailable()) {
        if (structural?.status !== "SPEC_BLOCKED") return "missing CAB did not surface SPEC_BLOCKED";
      } else if (structural?.status === "fail") {
        return `structural validation failed: ${structural.detail}`;
      }
      return undefined;
    }),
    probe("M5", () => {
      const bridge = readRepo("src/lib/etax/return-package-from-accounting.ts");
      if (!bridge.includes("evaluateTaxAdjustment")) return "accounting bridge does not read evaluateTaxAdjustment";
      const first = returnPackageFromTaxAdjustment({
        worksheet: { fiscal_year: "FY2026", as_of: "2026-03-31", taxable_income_yen: 10 },
        taxpayer: {
          taxpayerId: "TP-M5",
          zeimushoCd: "01101",
          zeimushoNm: "麹町",
          nozeishaId: "0000000000000001",
          nozeishaNm: "スコア株式会社",
          nozeishaAdr: "東京都千代田区",
        },
        draftPath: "docs/company/tax/FY2026-corporate-tax-draft.xml",
        teishutsuDay: "2026-03-31",
        createdBy: "score",
        now: "2026-09-21T00:00:00.000Z",
        id: "ETAX-PKG-score-m5",
      });
      const again = returnPackageFromTaxAdjustment({
        worksheet: { fiscal_year: "FY2026", as_of: "2026-03-31", taxable_income_yen: 10 },
        taxpayer: {
          taxpayerId: "TP-M5",
          zeimushoCd: "01101",
          zeimushoNm: "麹町",
          nozeishaId: "0000000000000001",
          nozeishaNm: "スコア株式会社",
          nozeishaAdr: "東京都千代田区",
        },
        draftPath: "docs/company/tax/FY2026-corporate-tax-draft.xml",
        teishutsuDay: "2026-03-31",
        createdBy: "score",
        now: "2026-09-21T00:00:00.000Z",
        id: "ETAX-PKG-score-m5",
      });
      if (first.contentHash !== again.contentHash) return "accounting bridge hash is not deterministic";
      if (!first.sourceReferences.some((row) => row.kind === "corporate_tax_xml_draft")) {
        return "sourceReferences missing corporate_tax_xml_draft";
      }
      return undefined;
    }),
    probe("M6", () => {
      const base = {
        status: "SUBMITTED" as const,
        requestId: "req-1",
        attempts: [{ requestId: "req-1", outcome: "started" as const }],
      };
      const unknown = recoverInFlightFiling(base, { status: "unknown" });
      if (unknown.record.status !== "SUBMITTED" || !unknown.escalate) return "unknown lookup advanced state";
      const missing = recoverInFlightFiling(base, { status: "not_found" });
      if (missing.record.status !== "SIGNED" || !missing.resendAllowed) return "not_found did not allow resend";
      const found = recoverInFlightFiling(base, { status: "found", receiptNumber: "RCPT-1" });
      if (found.record.status !== "RECEIVED_BY_ETAX" || found.record.receiptNumber !== "RCPT-1") {
        return "found lookup did not store the receipt";
      }
      return undefined;
    }),
    probe("M7", () => {
      const store = new FilingStore({ channel: "etax", now: "2026-09-21T00:00:00.000Z" });
      const created = store.create(scoreCreate("idem-1"));
      const reused = store.create(scoreCreate("idem-1"));
      if (reused.id !== created.id) return "same idempotency key and package was not reused";
      try {
        store.create({ ...scoreCreate("idem-1"), payload: { changed: true } });
        return "idempotency key accepted a different package";
      } catch (error) {
        if (!(error instanceof FilingException) || error.code !== "EFILING_IDEMPOTENCY_CLASH") {
          return "idempotency clash was not rejected";
        }
      }
      try {
        store.save({ ...created, status: "GENERATED" }, created.writeRevision + 9);
        return "stale write was accepted";
      } catch (error) {
        if (!(error instanceof FilingException) || error.code !== "EFILING_STALE_WRITE") {
          return "stale write was not rejected";
        }
      }
      return undefined;
    }),
    probe("M8", () => {
      try {
        assertFilingKind({ filingKind: "amended" });
        return "amended filing without prior receipt was accepted";
      } catch (error) {
        if (!(error instanceof FilingException)) return "amendment check did not fail closed";
      }
      try {
        assertFilingKind({ filingKind: "original", priorReceiptNumber: "RCPT" });
        return "original filing accepted a prior receipt";
      } catch (error) {
        if (!(error instanceof FilingException)) return "original prior-receipt check did not fail closed";
      }
      const store = new FilingStore({ channel: "etax", now: "2026-09-21T00:00:00.000Z" });
      const original = store.create(scoreCreate("idem-original"));
      const amended = store.create({
        ...scoreCreate("idem-amended"),
        id: "EFILING-amended",
        packageId: "PKG-amended",
        revision: 1,
        filingKind: "amended",
        priorReceiptNumber: "RCPT-ORIG",
      });
      if (amended.id === original.id) return "amendment overwrote the original filing";
      if (!amended.audit.every((row) => row.priorReceiptNumber === "RCPT-ORIG")) {
        return "audit row is not bound to the prior receipt";
      }
      if (amended.contentHash === original.contentHash) return "amendment did not change the package hash";
      return undefined;
    }),
    probe("M9", () => {
      const store = new FilingStore({ channel: "etax", now: "2026-09-21T00:00:00.000Z", retentionYears: 10 });
      const created = store.create(scoreCreate("idem-m9"));
      if (!created.retentionUntil.startsWith("2036-")) return "default retention is not 10 years";
      try {
        store.save({ ...created, legalHold: true, retentionUntil: "2030-01-01" }, created.writeRevision);
        return "retention was shortened";
      } catch (error) {
        if (!(error instanceof FilingException)) return "retention shorten was not rejected";
      }
      const held = store.save({ ...created, legalHold: true }, created.writeRevision);
      try {
        store.save({ ...held, legalHold: false }, held.writeRevision);
        return "legal_hold was released";
      } catch (error) {
        if (!(error instanceof FilingException) || error.code !== "EFILING_LEGAL_HOLD") {
          return "legal_hold release was not rejected";
        }
      }
      return undefined;
    }),
    probe("M10", () => {
      try {
        buildFilingChildEnv(process.env, { USER_PIN: "should-not-echo" });
        return "secret environment name was accepted";
      } catch (error) {
        if (!(error instanceof FilingException)) return "secret env was not rejected";
        if (error.message.includes("should-not-echo")) return "secret value leaked into the error";
      }
      const env = buildFilingChildEnv(
        { ...process.env, LD_PRELOAD: "/tmp/x", NODE_OPTIONS: "--inspect" },
        { FOO: "bar" },
      );
      if ("LD_PRELOAD" in env || "NODE_OPTIONS" in env) return "blocked child env keys were kept";
      try {
        assertCertifiedCommand({
          executable: "/bin/echo",
          executableSha256: "deadbeef",
          evidencePath: "/bin/echo",
          evidenceSha256: "deadbeef",
        });
        return "executable SHA mismatch was accepted";
      } catch (error) {
        if (!(error instanceof FilingException)) return "SHA pin was not enforced";
      }
      return undefined;
    }),
    probe("M11", () => {
      try {
        new FilingStore({ channel: "etax", production: true, encryptedStorage: false });
        return "production store started without encrypted storage";
      } catch (error) {
        if (!(error instanceof FilingException)) return "encrypted storage gate did not fail closed";
      }
      try {
        assertMockProviderForbidden("production");
        return "mock provider was allowed for production";
      } catch (error) {
        if (!(error instanceof FilingException)) return "mock provider was not forbidden";
      }
      const previous = process.env.ORGOS_ETAX_PRODUCTION;
      process.env.ORGOS_ETAX_PRODUCTION = "1";
      try {
        if (evaluateProductionEnablement().certified) return "ORGOS_ETAX_PRODUCTION enabled production";
      } finally {
        if (previous === undefined) delete process.env.ORGOS_ETAX_PRODUCTION;
        else process.env.ORGOS_ETAX_PRODUCTION = previous;
      }
      const required = new Set(ETAX_REQUIRED_SPEC_ARTIFACT_IDS);
      if (![...required].every((id) => defaultEtaxSpecFetchIds().includes(id))) {
        return "default spec fetch omits a required CAB";
      }
      return undefined;
    }),
    probe("M12", () => {
      try {
        new FilingStore({ channel: "eltax", rootPath: "/tmp/etax/state" });
        return "eLTAX store accepted an etax path";
      } catch (error) {
        if (!(error instanceof FilingException)) return "store root isolation failed";
      }
      const store = new FilingStore({ channel: "eltax", now: "2026-09-21T00:00:00.000Z" });
      try {
        store.create({ ...scoreCreate("idem-cross"), schema: ETAX_PACKAGE_SCHEMA });
        return "e-Tax package was stored as eLTAX";
      } catch (error) {
        if (!(error instanceof FilingException)) return "schema isolation failed";
      }
      try {
        assertTransportChannel("etax", "eltax");
        return "e-Tax transport accepted an eLTAX package";
      } catch (error) {
        if (!(error instanceof FilingException)) return "transport isolation failed";
      }
      try {
        assertSignatureChannel("eltax", "etax");
        return "eLTAX signature accepted an e-Tax package";
      } catch (error) {
        if (!(error instanceof FilingException)) return "signature isolation failed";
      }
      try {
        assertSpecChannel("etax", "eltax");
        return "e-Tax spec accepted an eLTAX package";
      } catch (error) {
        if (!(error instanceof FilingException)) return "spec isolation failed";
      }
      try {
        assertEltaxProcedureAllowed("RHO0010");
        return "eLTAX procedure was not fail-closed";
      } catch (error) {
        if (!(error instanceof FilingException)) return "eLTAX procedure gate failed open";
      }
      if (ELTAX_PACKAGE_SCHEMA === ETAX_PACKAGE_SCHEMA) return "package schemas are not distinct";
      return undefined;
    }),
    probe("M13", () => {
      const readiness = readRepo("steward/modules/readiness.yaml");
      const terms = readRepo("docs/product/legal/terms-of-service.md");
      const commercial = readRepo("product-fleet/commercial-declaration.yaml");
      const changelog = readRepo("CHANGELOG.md");
      if (!readiness.includes("NOT CERTIFIED") && !readiness.includes("NOT FOR PRODUCTION")) {
        return "readiness does not say production is uncertified";
      }
      if (!terms.includes("含まない") && !terms.includes("DISABLED")) {
        return "terms do not keep e-Tax submission out of the standard service";
      }
      if (!commercial.includes("含みません") && !commercial.includes("DISABLED")) {
        return "commercial declaration still omits the e-Tax exclusion";
      }
      if (changelog.includes("e-Tax対応完了（RHO0010）")) return "CHANGELOG claims e-Tax certification";
      if (evaluateProductionEnablement().certified) return "lane 2 certification is true on an uncertified tip";
      if (!existsSync(join(getInstallRoot(), "docs/etax/IMPLEMENTATION_PLAN.md"))) {
        return "implementation plan is missing";
      }
      const plan = readRepo("docs/etax/IMPLEMENTATION_PLAN.md");
      if (!plan.includes("M1") || plan.includes("Implementation-100 (achieved)")) {
        return "implementation plan still claims the old Implementation-100";
      }
      return undefined;
    }),
  ];

  const passed = items.filter((row) => row.pass).length;
  return {
    ok: passed === items.length,
    passed,
    total: implementationScoreItemIds.length,
    items,
    lane2Certified: false,
    productionSubmission: "NOT CERTIFIED / DISABLED",
  };
}

function scoreCreate(idempotencyKey: string) {
  return {
    id: "EFILING-score",
    packageId: "PKG-score",
    taxpayerId: "TP-SCORE",
    procedureCode: "EFILING-MOCK",
    taxYear: "FY2026",
    revision: 0,
    payload: { marker: "score" },
    sourceReferences: [],
    specVersion: "score",
    idempotencyKey,
    schema: ETAX_PACKAGE_SCHEMA,
  };
}
