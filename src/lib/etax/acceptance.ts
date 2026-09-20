/**
 * D1–D8 tip acceptance evaluators (real-operator track).
 * Results observe tip state only — never invent evidence or flip gates.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  etaxNtaCompletionEvidenceSchema,
  etaxTransmissionEvidenceSchema,
} from "../../../schemas/etax/transmission-evidence.js";
import { getInstallRoot, getWorkspaceRoot } from "../orgos-paths.js";
import { getModuleTier } from "../module-readiness.js";
import {
  ETAX_MODULE_ID,
  ETAX_PRODUCTION_BANNER_CERTIFIED,
} from "./constants.js";
import { checkInterFormRules } from "./inter-form.js";
import { probeEtaxHostBound } from "./host-client.js";
import { loadProcedureMatrix } from "./procedures.js";
import {
  loadEtaxProductionGate,
  productionStatusLine,
  productionSubmitBlockedReasons,
} from "./production-gate.js";
import { evaluateProductionEnablement } from "./production-review.js";
import { loadReceiptMapping } from "./receipt-mapping.js";
import { officialSignatureHostBound } from "./signature-catalog.js";
import { resolveOfficialXsd } from "./spec-fetch.js";
import { officialXsdAvailable } from "./spec-paths.js";
import { createReturnPackage } from "./return-package.js";
import { officialTransportHostBound } from "./transport-catalog.js";
import { validateEtaxDocument } from "./validate-layers.js";
import { generateOfficialXml } from "./xml-generator.js";
import { loadProcedureMapping } from "./xml-mapper.js";
import { validateXmlAgainstXsd, xmlLintAvailable } from "./xml-validate.js";
import {
  resolveSignatureProviderId,
} from "./adapters.js";
import { resolveTransportProviderId } from "./transport.js";
import { EtaxException } from "../../../schemas/etax/errors.js";

export type DxId = "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8";

export type DxResult = {
  id: DxId;
  ok: boolean;
  detail: string;
  blockers: string[];
};

const TOS_PATH = "docs/product/legal/terms-of-service.md";
const COMMERCIAL_PATH = "product-fleet/commercial-declaration.yaml";
/** When certified, ToS must not claim e-Tax filing is entirely out of scope for jp_etax. */
const TOS_EXCLUSION_SNIPPET = "e-Tax 申告・法定申告書の提出機能は本サービスの標準範囲に**含まない**";
const COMMERCIAL_EXCLUSION_SNIPPET = "e-Tax 提出は含みません";

export function transmissionTestDir(): string {
  return join(getWorkspaceRoot(), "data", "etax", "transmission-test");
}

export function findLatestTransmissionSubmitEvidence():
  | { path: string; evidence: ReturnType<typeof etaxTransmissionEvidenceSchema.parse> }
  | undefined {
  const dir = transmissionTestDir();
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter((n) => n.endsWith(".json") && n.includes("test-submit"))
    .map((n) => join(dir, n))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    })
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const path = files[i]!;
    try {
      const evidence = etaxTransmissionEvidenceSchema.parse(
        JSON.parse(readFileSync(path, "utf-8")),
      );
      return { path, evidence };
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function evaluateD1(): Promise<DxResult> {
  const blockers: string[] = [];
  if (process.platform !== "win32") {
    blockers.push("D1 requires Windows hostBound tip (not Darwin/Linux)");
  }
  if (!officialSignatureHostBound()) blockers.push("signature-catalog hostBound=false");
  if (!officialTransportHostBound()) blockers.push("transport-catalog hostBound=false");
  const probe = await probeEtaxHostBound();
  if (!probe.reachable) {
    blockers.push(`etax-host not reachable: ${probe.error ?? probe.health?.detail ?? "unknown"}`);
  }
  try {
    resolveSignatureProviderId("test", "mock");
    blockers.push("mock signature allowed on --env test (should refuse)");
  } catch (error) {
    if (!(error instanceof EtaxException)) blockers.push("unexpected mock signature error");
  }
  try {
    resolveTransportProviderId("test", "mock");
    blockers.push("mock transport allowed on --env test (should refuse)");
  } catch (error) {
    if (!(error instanceof EtaxException)) blockers.push("unexpected mock transport error");
  }
  return {
    id: "D1",
    ok: blockers.length === 0,
    detail:
      blockers.length === 0
        ? "hostBound tip + Windows host health + mock isolation"
        : "official host path not tip-ready",
    blockers,
  };
}

export function evaluateD2(): DxResult {
  const blockers: string[] = [];
  if (!officialXsdAvailable()) blockers.push("official e-tax19 XSD not unpacked");
  if (!xmlLintAvailable()) blockers.push("xmllint not available");
  if (!loadProcedureMapping("RHO0010")) blockers.push("RHO0010 mapping missing");
  const inter = checkInterFormRules("HOA110");
  if (inter.status !== "pass") blockers.push(`inter-form HOA110: ${inter.detail}`);

  if (blockers.length === 0) {
    try {
      const pkg = createReturnPackage(
        {
          taxpayerId: "TP-ACC-D2",
          procedureCode: "RHO0010",
          taxYear: "FY2026",
          revision: 0,
          payload: {
            it: {
              zeimushoCd: "01101",
              zeimushoNm: "麹町",
              nozeishaId: "0000000000000001",
              nozeishaNm: "テスト株式会社",
              nozeishaAdr: "東京都千代田区麹町一丁目",
              procedureCd: "RHO0010",
              sakuseiDay: "2026-03-31",
            },
          },
          createdBy: "acceptance",
          specVersion: "KSK2-2026-08-28",
        },
        { id: "ETAX-PKG-acc-d2", now: "2026-09-21T00:00:00.000Z" },
      );
      const xml = generateOfficialXml(pkg);
      const xsd = validateXmlAgainstXsd(xml, resolveOfficialXsd("hojin/RHO0010-150.xsd"));
      if (!xsd.ok) blockers.push(`Layer1 XSD fail: ${xsd.output}`);
      const report = validateEtaxDocument({ pkg, xml, env: "mock" });
      if (!report.ok) blockers.push("validate report.ok !== true");
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    id: "D2",
    ok: blockers.length === 0,
    detail: blockers.length === 0 ? "RHO0010 Layer1+Layer2 pass" : "official XML quality incomplete",
    blockers,
  };
}

export function evaluateD3(): DxResult {
  const blockers: string[] = [];
  try {
    const map = loadReceiptMapping();
    if (map.specArtifactId !== "e-tax18") blockers.push("receipt map not e-tax18");
    if (!map.fields.some((f) => f.role === "receiptNumber")) {
      blockers.push("receiptNumber field missing in map");
    }
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }
  const submit = findLatestTransmissionSubmitEvidence();
  if (!submit) {
    blockers.push("no valid T-O2 transmission-test JSON under data/etax/transmission-test/");
  } else if (submit.evidence.receiptNumber.startsWith("MOCK-NOT-NTA-")) {
    blockers.push("T-O2 receiptNumber still MOCK-NOT-NTA-");
  }
  return {
    id: "D3",
    ok: blockers.length === 0,
    detail: blockers.length === 0 ? "e-tax18 map + real T-O2 receipt" : "official receipt path incomplete",
    blockers,
  };
}

export function evaluateD4(): DxResult {
  const blockers: string[] = [];
  const gate = loadEtaxProductionGate();
  if (!gate.nta_transmission_test.completed) blockers.push("nta_transmission_test.completed=false");
  if (!gate.nta_transmission_test.evidence_path) {
    blockers.push("nta_transmission_test.evidence_path missing");
  } else {
    const abs = join(getWorkspaceRoot(), gate.nta_transmission_test.evidence_path);
    if (!existsSync(abs)) blockers.push(`evidence file missing: ${gate.nta_transmission_test.evidence_path}`);
    else {
      try {
        const raw = readFileSync(abs, "utf-8");
        // Accept JSON completion schema or plain L1 text with reference + date.
        if (raw.trim().startsWith("{")) {
          etaxNtaCompletionEvidenceSchema.parse(JSON.parse(raw));
        } else if (!/20\d{2}-\d{2}-\d{2}/.test(raw) || raw.length < 20) {
          blockers.push("evidence L1 text must include ISO date and non-trivial reference");
        }
      } catch (error) {
        blockers.push(
          error instanceof Error ? `evidence parse: ${error.message}` : "evidence parse failed",
        );
      }
    }
  }
  if (!gate.requirements.nta_transmission_test_completed) {
    blockers.push("requirements.nta_transmission_test_completed=false");
  }
  return {
    id: "D4",
    ok: blockers.length === 0,
    detail: blockers.length === 0 ? "NTA transmission evidence present" : "NTA transmission test incomplete",
    blockers,
  };
}

export function evaluateD5(): DxResult {
  const review = evaluateProductionEnablement();
  return {
    id: "D5",
    ok: review.certified === true,
    detail: review.certified ? "production-gate certified" : "production-gate not certified",
    blockers: review.certified ? [] : review.blockers,
  };
}

export function evaluateD6(): DxResult {
  const blockers: string[] = [];
  const row = loadProcedureMatrix().procedures.find((p) => p.procedureCode === "RHO0010");
  if (!row) blockers.push("RHO0010 missing from supported-procedures");
  else {
    if (row.support !== "SUPPORTED") blockers.push(`support=${row.support} (need SUPPORTED)`);
    if (row.productionEligible !== true) blockers.push("productionEligible=false");
  }
  return {
    id: "D6",
    ok: blockers.length === 0,
    detail: blockers.length === 0 ? "RHO0010 SUPPORTED + productionEligible" : "procedure not production-eligible",
    blockers,
  };
}

export function evaluateD7(): DxResult {
  const blockers: string[] = [];
  const tier = getModuleTier(ETAX_MODULE_ID);
  const order = ["skeleton", "experimental", "activation_ready", "production_ready"] as const;
  const tierIdx = order.indexOf(tier as (typeof order)[number]);
  const needIdx = order.indexOf("activation_ready");
  if (tierIdx < 0 || tierIdx < needIdx) {
    blockers.push(`jp_etax readiness tier=${tier} (need ≥ activation_ready)`);
  }
  const banner = productionStatusLine();
  if (banner !== ETAX_PRODUCTION_BANNER_CERTIFIED) {
    blockers.push(`banner is not CERTIFIED: ${banner}`);
  }
  const tos = join(getInstallRoot(), TOS_PATH);
  const commercial = join(getInstallRoot(), COMMERCIAL_PATH);
  if (!existsSync(tos)) blockers.push(`ToS missing: ${TOS_PATH}`);
  else {
    const text = readFileSync(tos, "utf-8");
    // When D7 is claimed, exclusion of jp_etax production must be lifted or narrowed.
    if (text.includes(TOS_EXCLUSION_SNIPPET) && !text.includes("RHO0010")) {
      blockers.push("ToS still excludes e-Tax filing without RHO0010 enablement clause");
    }
    if (!text.includes("RHO0010") && !text.includes("jp_etax")) {
      blockers.push("ToS does not mention jp_etax / RHO0010 enablement");
    }
  }
  if (!existsSync(commercial)) blockers.push(`commercial declaration missing: ${COMMERCIAL_PATH}`);
  else {
    const text = readFileSync(commercial, "utf-8");
    if (text.includes(COMMERCIAL_EXCLUSION_SNIPPET) && !text.includes("RHO0010")) {
      blockers.push("commercial declaration still says e-Tax提出は含みません without RHO0010 carve-out");
    }
  }
  return {
    id: "D7",
    ok: blockers.length === 0,
    detail: blockers.length === 0 ? "readiness + banner + ToS aligned" : "product copy / readiness incomplete",
    blockers,
  };
}

export function evaluateD8(): DxResult {
  const blockers: string[] = [];
  try {
    resolveSignatureProviderId("production", "mock");
    blockers.push("mock signature allowed in production");
  } catch {
    /* expected */
  }
  const reasons = productionSubmitBlockedReasons("production");
  const prev = process.env.ORGOS_ETAX_PRODUCTION;
  process.env.ORGOS_ETAX_PRODUCTION = "1";
  try {
    const withEnv = productionSubmitBlockedReasons("production");
    if (withEnv.length === 0 && reasons.length > 0) {
      blockers.push("ORGOS_ETAX_PRODUCTION=1 cleared blockers");
    }
    if (!withEnv.some((r) => r.includes("ORGOS_ETAX_PRODUCTION=1 is ignored")) && reasons.length > 0) {
      // only required when still blocked
      if (withEnv.length > 0 && !withEnv.some((r) => r.includes("ignored"))) {
        blockers.push("ORGOS_ETAX_PRODUCTION=1 not reported as ignored");
      }
    }
  } finally {
    if (prev === undefined) delete process.env.ORGOS_ETAX_PRODUCTION;
    else process.env.ORGOS_ETAX_PRODUCTION = prev;
  }

  const taxRoots = [
    join(getInstallRoot(), "steward/jurisdiction-packs/JP/modules/jp_tax_corporate"),
    join(getInstallRoot(), "steward/jurisdiction-packs/JP/modules/jp_tax_consumption"),
  ];
  const forbidden = [/submitToEtax/, /createTransportAdapter/];
  for (const root of taxRoots) {
    if (!existsSync(root)) continue;
    for (const file of walkFiles(root)) {
      if (!/\.(ts|js|md)$/.test(file)) continue;
      const text = readFileSync(file, "utf-8");
      for (const re of forbidden) {
        if (re.test(text)) blockers.push(`${file} matches ${re}`);
      }
    }
  }

  const registry = readFileSync(
    join(getInstallRoot(), "steward/jurisdiction-packs/JP/modules/jp_etax/spec/manifest.json"),
    "utf-8",
  );
  if (/shiyo3\.htm/.test(registry) && !/ksk2/.test(registry)) {
    blockers.push("spec manifest looks like shiyo3-only baseline");
  }

  // PIN must not appear as CLI flag documentation in etax registrar
  const registrar = readFileSync(
    join(getInstallRoot(), "src/cli/registrars/etax.ts"),
    "utf-8",
  );
  if (/--pin\b/i.test(registrar) || /password.*=/.test(registrar)) {
    blockers.push("etax CLI appears to accept PIN/password flags");
  }

  return {
    id: "D8",
    ok: blockers.length === 0,
    detail: blockers.length === 0 ? "safety invariants hold" : "safety invariant broken",
    blockers,
  };
}

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

export async function evaluateAllDx(): Promise<{
  ok: boolean;
  results: DxResult[];
  certified: boolean;
}> {
  const results: DxResult[] = [
    await evaluateD1(),
    evaluateD2(),
    evaluateD3(),
    evaluateD4(),
    evaluateD5(),
    evaluateD6(),
    evaluateD7(),
    evaluateD8(),
  ];
  return {
    ok: results.every((r) => r.ok),
    results,
    certified: evaluateProductionEnablement().certified,
  };
}
