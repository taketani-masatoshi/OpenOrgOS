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
import { buildConsumptionTaxFilingDraft } from "../finance/consumption-tax-filing.js";

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

  let consumptionTax: unknown;
  try {
    consumptionTax = buildConsumptionTaxFilingDraft(fiscalYear);
  } catch (error) {
    consumptionTax = { error: error instanceof Error ? error.message : String(error) };
  }
  const consumptionTaxPath = join(packageDir, "consumption-tax-filing-draft.json");
  writeFileSync(consumptionTaxPath, JSON.stringify(consumptionTax, null, 2), "utf-8");

  const advisorReviewPath = join(packageDir, "advisor-review-checklist.md");
  writeFileSync(
    advisorReviewPath,
    [
      `# 税務専門家レビュー — ${fiscalYear}`,
      "",
      "この記録は自動承認されません。確認者本人が根拠資料とともに記入してください。",
      "",
      "- [ ] 課税事業者区分・課税期間",
      "- [ ] 税率区分・課税標準・端数処理",
      "- [ ] 仕入税額控除・インボイス経過措置",
      "- [ ] 課税売上割合・95%ルール・5億円基準",
      "- [ ] 簡易課税・2割特例・複数事業区分",
      "- [ ] 輸入消費税・中間納付・年度間調整",
      "- [ ] 売上返品・値引き・貸倒れ調整",
      "",
      "確認者参照:",
      "確認日時:",
      "証憑参照:",
      "結論: approved / rejected",
      "",
      "承認後は同じ値を tax-profile.yaml の consumption_tax.advisor_reviews に記録します。",
    ].join("\n"),
    "utf-8",
  );

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
      "- consumption-tax filing draft: `consumption-tax-filing-draft.json`",
      "- advisor review: `advisor-review-checklist.md`",
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
      consumptionTaxPath,
      advisorReviewPath,
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
