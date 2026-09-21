/**
 * JP corporate tax return XML draft (ADR 0052 Phase 5b).
 *
 * Built from internal books (GL · tax-profile). Unapproved output is
 * `not-for-etax`. External send is a separate 5c gate after user approval.
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
import { ETAX_DRAFT_SUBMISSION } from "../tax/etax-filing-boundary.js";
import { buildCorporateTaxAdjustments } from "./corporate-tax-adjustments.js";
import type { CorporateTaxAdjustmentLine } from "../../../schemas/finance/tax-adjustments.js";

export type CorporateTaxXmlDraft = {
  fiscal_year: string;
  as_of: string;
  xml: string;
  relative_path: string;
  absolute_path: string;
  submission: typeof ETAX_DRAFT_SUBMISSION;
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
  adjustments?: CorporateTaxAdjustmentLine[];
} {
  try {
    const profile = loadTaxProfile() as {
      corporate_tax?: {
        estimated_tax_status?: string;
        estimated_tax_fy2026?: number;
        notes?: string;
        adjustments?: CorporateTaxAdjustmentLine[];
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
  lines?: CorporateTaxAdjustmentLine[];
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
  const adjustments = buildCorporateTaxAdjustments({
    netIncomeYen: sheet.net_income_yen,
    lines: input?.lines ?? corp.adjustments ?? [],
  });
  const pending = [
    ...adjustments.advisor_pending,
    "retained_breakdown",
    "official_form_mapping",
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OrgOSCorporateTaxDraft
  xmlns="urn:openorgos:jp-tax-corporate:draft:1"
  schemaVersion="1"
  purpose="advisor-handoff-draft"
  submission="${ETAX_DRAFT_SUBMISSION}"
  generatedAt="${escapeXml(generatedAt)}"
>
  <Disclaimer>
    OrgOS draft from internal books (ADR 0052 Phase 5b). Official schema alignment continues.
    External send requires user approval (5c). Do not treat this file as a live filing.
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
  <AnnexDraft id="betsu-4-like" label="別表四相当・所得の金額の計算">
    <Line code="current_net_income" label="当期純利益">${adjustments.net_income_yen}</Line>
    <AdjustmentsAbsent>${adjustments.adjustments_absent ? "true" : "false"}</AdjustmentsAbsent>
    <Line code="add_backs" label="加算">${adjustments.add_backs_yen}</Line>
    <Line code="subtractions" label="減算">${adjustments.subtractions_yen}</Line>
    <Line code="taxable_income_estimate" label="課税所得の見積">${adjustments.taxable_income_yen}</Line>
  </AnnexDraft>
  <AnnexDraft id="betsu-5-1-like" label="別表五（一）相当・利益積立金（概算）">
    <Line code="total_equity" label="純資産合計">${sheet.total_equity_yen}</Line>
    <Line code="retained_placeholder" label="利益積立金内訳（税理士確定）">${sheet.total_equity_yen}</Line>
  </AnnexDraft>
  <Completeness>
    <Filled>entity,statements,betsu-4-estimate,betsu-5-equity</Filled>
    <AdvisorPending>${escapeXml(pending.join(","))}</AdvisorPending>
    <Submission>${ETAX_DRAFT_SUBMISSION}</Submission>
  </Completeness>
</OrgOSCorporateTaxDraft>
`;

  const relative_path = `docs/company/tax/${fiscalYear.toLowerCase()}-corporate-tax-draft.xml`;
  return {
    fiscal_year: fiscalYear,
    as_of: asOf,
    xml,
    relative_path,
    submission: ETAX_DRAFT_SUBMISSION,
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
