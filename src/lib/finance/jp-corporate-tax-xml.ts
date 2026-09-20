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
import { evaluateTaxAdjustment } from "./tax-adjustment.js";

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

export function buildCorporateTaxXmlDraft(input?: {
  fiscalYear?: string;
  asOf?: string;
}): Omit<CorporateTaxXmlDraft, "relative_path" | "absolute_path"> & {
  relative_path: string;
} {
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
  const annex = worksheet.can_compute
    ? `<AnnexDraft id="betsu-4-like" label="別表四相当・所得の金額の計算">
    <Line code="current_net_income" label="当期純利益">${worksheet.starting_profit_yen}</Line>
    <Line code="add_backs" label="加算">${worksheet.additions_yen}</Line>
    <Line code="subtractions" label="減算">${worksheet.subtractions_yen}</Line>
    <Line code="taxable_income_estimate" label="課税所得">${worksheet.taxable_income_yen}</Line>
  </AnnexDraft>`
    : `<AnnexDraft id="betsu-4-like" label="別表四相当・所得の金額の計算">
    <AdvisorPending>${escapeXml(worksheet.errors.join(","))}</AdvisorPending>
  </AnnexDraft>`;
  const roll = worksheet.retained_rollforward;
  const betsu5 = roll
    ? `<AnnexDraft id="betsu-5-1-like" label="別表五（一）相当・利益剰余金">
    <Line code="opening_retained" label="期首利益剰余金">${roll.opening_yen}</Line>
    <Line code="net_income" label="当期純利益">${roll.net_income_yen}</Line>
    <Line code="dividends" label="配当">${roll.dividend_yen}</Line>
    <Line code="capital" label="資本取引">${roll.capital_yen}</Line>
    <Line code="closing_retained" label="期末利益剰余金">${roll.closing_yen}</Line>
  </AnnexDraft>`
    : `<AnnexDraft id="betsu-5-1-like" label="別表五（一）相当・利益剰余金">
    <AdvisorPending>${escapeXml(worksheet.errors.join(","))}</AdvisorPending>
  </AnnexDraft>`;
  const completenessFilled = worksheet.can_compute
    ? "entity,statements,betsu-4,betsu-5-retained"
    : "entity,statements";
  const completenessPending = worksheet.can_compute
    ? "official_form_mapping"
    : escapeXml(worksheet.errors.join(","));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OrgOSCorporateTaxDraft
  xmlns="urn:openorgos:jp-tax-corporate:draft:1"
  schemaVersion="1"
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
    ${
      corp.estimated_tax_fy2026 != null
        ? `<EstimatedTaxYen>${corp.estimated_tax_fy2026}</EstimatedTaxYen>`
        : ""
    }
    ${corp.notes ? `<Notes>${escapeXml(corp.notes)}</Notes>` : ""}
  </CorporateTaxPrep>
  ${annex}
  ${betsu5}
  <Completeness>
    <Filled>${completenessFilled}</Filled>
    <AdvisorPending>${completenessPending}</AdvisorPending>
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
