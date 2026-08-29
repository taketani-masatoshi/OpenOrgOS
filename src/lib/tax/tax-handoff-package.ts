/**
 * Tax module handoff package (accounting → tax separation).
 * e-Tax / eLTAX production submit remains human-only (ADR 0052 Phase 5c).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { getDocsDir } from "../utils.js";
import { writeCorporateTaxXmlDraft } from "../finance/jp-corporate-tax-xml.js";
import { buildTaxReadinessReport } from "../product/ledger-tax-readiness.js";
import { buildTrialBalance } from "../finance/ledger/trial-balance.js";
import { getClock } from "../runtime-context.js";
import { resolveDefaultFiscalYear, fiscalYearEndDate, resolveCompanyFiscalYearEndMonth } from "../finance/fiscal-year.js";
import { buildPayrollYearEndReadiness } from "../finance/payroll-bonus-yea.js";

export type TaxHandoffPackage = {
  fiscal_year: string;
  package_dir: string;
  zip_path: string;
  files: string[];
  submission: "not-for-etax";
  note: string;
};

export function buildTaxHandoffPackage(input?: {
  fiscalYear?: string;
}): TaxHandoffPackage {
  const fiscalYear = input?.fiscalYear ?? resolveDefaultFiscalYear();
  const yearEndMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = fiscalYearEndDate(fiscalYear, yearEndMonth);
  const xml = writeCorporateTaxXmlDraft({ fiscalYear, asOf });
  let readiness: unknown;
  try {
    readiness = buildTaxReadinessReport();
  } catch (error) {
    readiness = {
      error: error instanceof Error ? error.message : String(error),
      note: "partial readiness — chart/journal_source_accounts may be incomplete",
    };
  }
  let tb: unknown = { note: "trial balance unavailable" };
  try {
    tb = buildTrialBalance({ asOf });
  } catch (error) {
    tb = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const packageDir = join(getDocsDir(), "company", "tax", "handoff", fiscalYear);
  mkdirSync(packageDir, { recursive: true });

  const readinessPath = join(packageDir, "tax-readiness.json");
  writeFileSync(readinessPath, JSON.stringify(readiness, null, 2), "utf-8");

  const tbPath = join(packageDir, "trial-balance.json");
  writeFileSync(tbPath, JSON.stringify(tb, null, 2), "utf-8");

  const notePath = join(packageDir, "README.md");
  let yeaNote = "";
  try {
    const yea = buildPayrollYearEndReadiness(fiscalYear);
    const yeaPath = join(packageDir, "yea-readiness.json");
    writeFileSync(yeaPath, JSON.stringify(yea, null, 2), "utf-8");
    if (yea.ready_for_tax_handoff) {
      yeaNote = `\n- YEA status: \`${yea.yea_status}\` (ready_for_handoff — 年末調整は顧問手作業)\n`;
    } else {
      yeaNote = `\n- YEA status: \`${yea.yea_status}\`\n`;
    }
  } catch {
    yeaNote = "\n- YEA: unavailable\n";
  }

  writeFileSync(
    notePath,
    [
      `# 税務 handoff — ${fiscalYear}`,
      "",
      "本パッケージは顧問税理士向けです。**e-Tax / eLTAX への本番提出は含みません**（ADR 0052）。",
      "",
      `- XML draft: \`${xml.relative_path}\``,
      `- generated_at: ${getClock().now().toISOString()}`,
      yeaNote,
      "## 提出について",
      "",
      "提出は税務モジュール外の人間オペレーションです。OrgOS Ledger（会計）は帳簿・試算表・XML ドラフトまでを提供します。",
      "",
    ].join("\n"),
    "utf-8",
  );

  // Copy XML into package dir for zip convenience
  const xmlCopy = join(packageDir, `${fiscalYear}-corporate-tax-draft.xml`);
  writeFileSync(xmlCopy, xml.xml, "utf-8");

  const zipPath = join(
    getDocsDir(),
    "company",
    "tax",
    "handoff",
    `${fiscalYear}-tax-handoff.zip`,
  );
  mkdirSync(join(zipPath, ".."), { recursive: true });
  execSync(`rm -f "${zipPath}" && tar -czf "${zipPath}" -C "${packageDir}" .`, {
    stdio: "ignore",
  });

  return {
    fiscal_year: fiscalYear,
    package_dir: packageDir,
    zip_path: zipPath,
    files: [
      readinessPath,
      tbPath,
      notePath,
      xmlCopy,
      zipPath,
    ],
    submission: "not-for-etax",
    note: "Advisor handoff only — e-Tax submit is outside OrgOS Ledger",
  };
}

export function taxModuleBoundaryNote(): string {
  return "Tax filing (e-Tax/eLTAX) belongs to jp_tax_corporate module handoff; Ledger product does not submit returns.";
}
