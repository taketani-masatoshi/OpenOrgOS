/**
 * JP corporate tax return XML draft (ADR 0052 Phase 5b).
 *
 * Purpose: advisor handoff package — NOT e-Tax / eLTAX submission (5c is human-only).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCompany, loadTaxProfile } from "../data.js";
import { getDocsDir } from "../utils.js";
import {
  fiscalYearEndDate,
  resolveCompanyFiscalYearEndMonth,
  resolveDefaultFiscalYear,
} from "./fiscal-year.js";
import { buildBalanceSheet } from "./ledger/balance-sheet.js";
import { buildGlProfitLossSummary } from "./gl-report-basis.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { getClock } from "../runtime-context.js";
import { assertJpTaxProfile } from "./indirect-tax/port.js";
import {
  CORPORATE_TAX_FORM_EDITION,
  evaluateTaxAdjustment,
  type OfficialAnnexLine,
  type TaxAdjustmentWorksheet,
} from "./tax-adjustment.js";

export type CorporateTaxXmlDraft = {
  fiscal_year: string;
  as_of: string;
  xml: string;
  relative_path: string;
  absolute_path: string;
  submission: "not-for-etax";
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadCorporateTaxSlice(): {
  estimated_tax_status?: string;
  estimated_tax_fy2026?: number;
  notes?: string;
} {
  try {
    const profile = loadTaxProfile() as {
      corporate_tax?: {
        estimated_tax_status?: string;
        estimated_tax_fy2026?: number;
        notes?: string;
      };
    };
    return profile.corporate_tax ?? {};
  } catch {
    return {};
  }
}

function annexBlock(
  form: string,
  label: string,
  lines: OfficialAnnexLine[],
  pending: string | null
): string {
  const header = `<Annex form="${escapeXml(form)}" edition="${CORPORATE_TAX_FORM_EDITION}" label="${escapeXml(label)}">`;
  if (pending != null) {
    return `${header}
    <AdvisorPending>${escapeXml(pending)}</AdvisorPending>
  </Annex>`;
  }
  const body = lines
    .map((line) => {
      const column = line.col ? ` col="${line.col}"` : "";
      return `    <Line form="${escapeXml(line.form)}" row="${line.row}"${column} label="${escapeXml(line.label)}">${line.amount_yen}</Line>`;
    })
    .join("\n");
  return `${header}
${body}
  </Annex>`;
}

function advisorPending(worksheet: TaxAdjustmentWorksheet): string {
  if (!worksheet.can_compute) return worksheet.errors.join(",");
  return [...worksheet.official_pending, "unused_statutory_rows"].join(",");
}

function annexOrPending(
  form: string,
  label: string,
  lines: OfficialAnnexLine[],
  worksheet: TaxAdjustmentWorksheet
): string {
  if (!worksheet.can_compute) {
    return annexBlock(form, label, [], worksheet.errors.join(",") || "uncomputed");
  }
  if (lines.length > 0) return annexBlock(form, label, lines, null);
  if (form === "別表五（一）") return annexBlock(form, label, [], "capital_unmapped");
  const reason =
    worksheet.official_pending.filter((item) => item !== "capital_unmapped").join(",") ||
    "official_rows_withheld";
  return annexBlock(form, label, [], reason);
}

export function buildCorporateTaxXmlDraft(input?: { fiscalYear?: string; asOf?: string }): Omit<
  CorporateTaxXmlDraft,
  "relative_path" | "absolute_path"
> & {
  relative_path: string;
} {
  assertJpTaxProfile();
  const company = loadCompany();
  const fiscalYear = resolveDefaultFiscalYear(input?.fiscalYear);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = input?.asOf ?? fiscalYearEndDate(fiscalYear, endMonth);
  let sheet = {
    balanced: false,
    total_assets_yen: 0,
    total_liabilities_yen: 0,
    total_equity_yen: 0,
    net_income_yen: 0,
  };
  let pl = { revenue_total: 0, net_profit: 0 };
  let trial = {
    balanced: false,
    debit_total_yen: 0,
    credit_total_yen: 0,
    rows: [] as unknown[],
  };
  try {
    sheet = buildBalanceSheet({ asOf, fiscalYear });
  } catch {
    /* handoff still useful with partial statements */
  }
  try {
    pl = buildGlProfitLossSummary({ asOf, fiscalYear });
  } catch {
    /* ignore */
  }
  try {
    trial = buildTrialBalance({ asOf });
  } catch {
    /* ignore */
  }
  const corp = loadCorporateTaxSlice();
  const generatedAt = getClock().now().toISOString();
  const worksheet = evaluateTaxAdjustment(fiscalYear);
  const pending = advisorPending(worksheet);
  const betsu4Lines = worksheet.official_lines.filter((line) => line.form === "別表四");
  const betsu5Lines = worksheet.official_lines.filter((line) => line.form === "別表五（一）");
  const betsu1Lines = worksheet.official_lines.filter((line) => line.form === "別表一");
  const annex4 = annexOrPending("別表四", "所得の金額の計算に関する明細書", betsu4Lines, worksheet);
  const annex5 = annexOrPending(
    "別表五（一）",
    "利益積立金額及び資本金等の額の計算に関する明細書",
    betsu5Lines,
    worksheet
  );
  const annex1 = annexOrPending("別表一", "各事業年度の所得に係る申告書", betsu1Lines, worksheet);
  const leafLines = worksheet.official_lines.filter((line) => line.form === "別表一次葉");
  const annexLeaf =
    leafLines.length > 0 ? annexBlock("別表一次葉", "法人税額の計算", leafLines, null) : "";
  const filled = ["entity", "statements"];
  if (betsu4Lines.some((line) => line.row === "52")) filled.push("betsu-4");
  if (betsu5Lines.some((line) => line.row === "31")) filled.push("betsu-5-retained");
  if (worksheet.corporate_tax_yen != null) filled.push("betsu-1");
  const corporateTax =
    worksheet.corporate_tax_yen != null
      ? `<CorporateTaxYen>${worksheet.corporate_tax_yen}</CorporateTaxYen>`
      : "";
  const profileEstimate =
    corp.estimated_tax_fy2026 != null
      ? `<ProfileEstimateYen purpose="comparison-only">${corp.estimated_tax_fy2026}</ProfileEstimateYen>`
      : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OrgOSCorporateTaxDraft
  xmlns="urn:openorgos:jp-tax-corporate:draft:1"
  schemaVersion="2"
  purpose="advisor-handoff-draft"
  submission="not-for-etax"
  generatedAt="${escapeXml(generatedAt)}"
>
  <Disclaimer>
    This file is an OrgOS Ledger draft for tax-advisor handoff (ADR 0052 Phase 5b).
    It is not an official e-Tax / NTA return XML and must not be submitted as-is.
  </Disclaimer>
  <Entity>
    <LegalName>${escapeXml(company.name)}</LegalName>
    <DisplayName>${escapeXml(company.name)}</DisplayName>
    <FiscalYear>${escapeXml(fiscalYear)}</FiscalYear>
    <AsOf>${escapeXml(asOf)}</AsOf>
  </Entity>
  <Statements>
    <BalanceSheet balanced="${sheet.balanced ? "true" : "false"}">
      <TotalAssetsYen>${sheet.total_assets_yen}</TotalAssetsYen>
      <TotalLiabilitiesYen>${sheet.total_liabilities_yen}</TotalLiabilitiesYen>
      <TotalEquityYen>${sheet.total_equity_yen}</TotalEquityYen>
      <NetIncomeYen>${sheet.net_income_yen}</NetIncomeYen>
    </BalanceSheet>
    <ProfitLoss>
      <RevenueYen>${pl.revenue_total}</RevenueYen>
      <NetProfitYen>${pl.net_profit}</NetProfitYen>
    </ProfitLoss>
    <TrialBalance balanced="${trial.balanced ? "true" : "false"}">
      <DebitTotalYen>${trial.debit_total_yen}</DebitTotalYen>
      <CreditTotalYen>${trial.credit_total_yen}</CreditTotalYen>
      <RowCount>${trial.rows.length}</RowCount>
    </TrialBalance>
  </Statements>
  <CorporateTaxPrep>
    <EstimatedTaxStatus>${escapeXml(corp.estimated_tax_status ?? "unknown")}</EstimatedTaxStatus>
    ${corporateTax}
    ${profileEstimate}
    ${corp.notes ? `<Notes>${escapeXml(corp.notes)}</Notes>` : ""}
  </CorporateTaxPrep>
  ${annex4}
  ${annex5}
  ${annex1}
  ${annexLeaf}
  <Completeness>
    <Filled>${filled.join(",")}</Filled>
    <AdvisorPending>${escapeXml(pending)}</AdvisorPending>
    <Submission>not-for-etax</Submission>
  </Completeness>
</OrgOSCorporateTaxDraft>
`;

  const relative_path = `docs/company/tax/${fiscalYear.toLowerCase()}-corporate-tax-draft.xml`;
  return {
    fiscal_year: fiscalYear,
    as_of: asOf,
    xml,
    relative_path,
    submission: "not-for-etax",
  };
}

export function writeCorporateTaxXmlDraft(input?: {
  fiscalYear?: string;
  asOf?: string;
}): CorporateTaxXmlDraft {
  const draft = buildCorporateTaxXmlDraft(input);
  const absolute_path = join(getDocsDir(), draft.relative_path.replace(/^docs\//, ""));
  mkdirSync(join(absolute_path, ".."), { recursive: true });
  writeFileSync(absolute_path, draft.xml, "utf-8");
  return { ...draft, absolute_path };
}
