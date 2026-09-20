/**
 * Record T-O2 / NTA completion evidence under gitignored transmission-test/.
 * Never sets production-gate completed flags — human edits gate yaml.
 * Promote RHO0010 only after D4 evaluates ok.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  etaxNtaCompletionEvidenceSchema,
  etaxTransmissionEvidenceSchema,
  type EtaxNtaCompletionEvidence,
  type EtaxTransmissionEvidence,
} from "../../../schemas/etax/transmission-evidence.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { getInstallRoot, getWorkspaceRoot } from "../orgos-paths.js";
import { evaluateD4, evaluateD5, evaluateD6, transmissionTestDir } from "./acceptance.js";

export function writeTransmissionSubmitEvidence(
  input: EtaxTransmissionEvidence,
): { path: string; evidence: EtaxTransmissionEvidence } {
  const evidence = etaxTransmissionEvidenceSchema.parse(input);
  const dir = transmissionTestDir();
  mkdirSync(dir, { recursive: true });
  const stamp = evidence.submittedAt.replace(/[:.]/g, "-");
  const path = join(dir, `rho0010-test-submit-${stamp}.json`);
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf-8");
  return { path, evidence };
}

export function writeNtaCompletionEvidence(
  input: EtaxNtaCompletionEvidence,
): { path: string; evidence: EtaxNtaCompletionEvidence } {
  const evidence = etaxNtaCompletionEvidenceSchema.parse(input);
  const dir = transmissionTestDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "nta-completion.json");
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf-8");
  return { path, evidence };
}

export function promoteRho0010Supported(opts: { actor: string }): { path: string } {
  const d4 = evaluateD4();
  if (!d4.ok) {
    throw etaxError({
      code: "ETAX_PROMOTE_REQUIRES_D4",
      blocked: "PRODUCTION_DISABLED",
      message: `Cannot promote RHO0010: D4 incomplete — ${d4.blockers.join("; ")}`,
    });
  }
  const procPath = join(
    getInstallRoot(),
    "steward/jurisdiction-packs/JP/modules/jp_etax/spec/supported-procedures.yaml",
  );
  if (!existsSync(procPath)) {
    throw etaxError({
      code: "ETAX_PROCEDURES_MISSING",
      message: `supported-procedures.yaml missing: ${procPath}`,
    });
  }
  let text = readFileSync(procPath, "utf-8");
  if (!text.includes("procedureCode: RHO0010")) {
    throw etaxError({
      code: "ETAX_RHO0010_MISSING",
      message: "RHO0010 row missing",
    });
  }
  text = text
    .replace(/support: EXPERIMENTAL/, "support: SUPPORTED")
    .replace(/productionEligible: false/, "productionEligible: true")
    .replace(
      /title: 普通法人の確定申告（青色）— OpenOrgOS EXPERIMENTAL first procedure/,
      "title: 普通法人の確定申告（青色）— OpenOrgOS SUPPORTED (RHO0010)",
    );
  if (!text.includes("support: SUPPORTED") || !text.includes("productionEligible: true")) {
    throw etaxError({
      code: "ETAX_PROMOTE_REPLACE_FAILED",
      message: "Failed to rewrite RHO0010 support flags",
    });
  }
  writeFileSync(procPath, text, "utf-8");
  const audit = join(transmissionTestDir(), "promote-log.txt");
  mkdirSync(dirname(audit), { recursive: true });
  writeFileSync(
    audit,
    `at=${new Date().toISOString()} actor=${opts.actor} action=promote.RHO0010.SUPPORTED\n`,
    { flag: "a" },
  );
  return { path: procPath };
}

/** Sync ToS / commercial carve-out for RHO0010 only when D5 certified. */
export function syncProductCopyForRho0010(opts: { actor: string }): {
  tosPath: string;
  commercialPath: string;
} {
  const d5 = evaluateD5();
  const d6 = evaluateD6();
  if (!d5.ok || !d6.ok) {
    throw etaxError({
      code: "ETAX_PRODUCT_COPY_REQUIRES_D5_D6",
      blocked: "PRODUCTION_DISABLED",
      message: `ToS sync requires D5+D6: ${[...d5.blockers, ...d6.blockers].join("; ")}`,
    });
  }
  const tosPath = join(getInstallRoot(), "docs/product/legal/terms-of-service.md");
  const commercialPath = join(getInstallRoot(), "product-fleet/commercial-declaration.yaml");
  let tos = readFileSync(tosPath, "utf-8");
  const tosClause =
    "3. e-Tax 申告・法定申告書の提出機能は本サービスの標準範囲に**含まない**。専用モジュール `jp_etax` は実験的であり、国税庁送信試験と production gate 完了まで本番送信を行わない。";
  const tosReplacement =
    "3. e-Tax 提出は専用モジュール `jp_etax` に限定する。第一手続 **RHO0010**（普通法人の確定申告・青色）は production-gate certified 後に本番送信可能。他手続・他税目は含まない。PIN/秘密鍵は OrgOS に保存しない。";
  if (tos.includes(tosClause)) {
    tos = tos.replace(tosClause, tosReplacement);
  } else if (!tos.includes("RHO0010")) {
    tos = `${tos.trimEnd()}\n\n${tosReplacement}\n`;
  }
  writeFileSync(tosPath, tos.endsWith("\n") ? tos : `${tos}\n`, "utf-8");

  let commercial = readFileSync(commercialPath, "utf-8");
  commercial = commercial.replace(
    /e-Tax 提出は含みません。/,
    "e-Tax 提出は jp_etax の RHO0010（production-gate certified）に限定。他手続は含みません。",
  );
  writeFileSync(commercialPath, commercial.endsWith("\n") ? commercial : `${commercial}\n`, "utf-8");

  const audit = join(getWorkspaceRoot(), "data", "etax", "transmission-test", "product-copy-log.txt");
  mkdirSync(dirname(audit), { recursive: true });
  writeFileSync(
    audit,
    `at=${new Date().toISOString()} actor=${opts.actor} action=product-copy.RHO0010\n`,
    { flag: "a" },
  );
  return { tosPath, commercialPath };
}
