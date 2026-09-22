import type { Company } from "../../../schemas/company.js";
import type { YojitsuPlan } from "../../../schemas/finance.js";
import { loadOrgCompanyReport } from "../org/tenant-data.js";
import {
  fiscalYearEndDate,
  fiscalYearStartDate,
  resolveCompanyFiscalYearEndMonth,
} from "./fiscal-year.js";
import { buildGlProfitLossSummary } from "./gl-report-basis.js";
import { buildCompaniesActStatementPack } from "./ledger/companies-act-statement-map.js";

/** GL totals shaped like a plan so the kessan PDF can render without a yojitsu file. */
export function synthesizeYojitsuFromGl(fiscalYear: string): YojitsuPlan {
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = fiscalYearEndDate(fiscalYear, endMonth);
  const gl = buildGlProfitLossSummary({ fiscalYear, asOf });
  const year = Number(fiscalYear.slice(2));
  return {
    year: Number.isFinite(year) ? year : 2026,
    fiscal_year: fiscalYear,
    period_from: fiscalYearStartDate(fiscalYear, endMonth),
    period_to: asOf,
    months: [],
    summary: {
      revenue_total: gl.revenue_total,
      operating_profit: gl.operating_profit,
      pretax_profit: gl.pretax_profit,
      net_profit: gl.net_profit,
    },
    closing: {
      status: "closed",
      basis: "gl",
      closed_at: asOf,
    },
  };
}

/** Builds the statutory pack from the ledger. A missing yojitsu file is not an error. */
export function evaluateKessanFromGl(fiscalYear: string): {
  ok: boolean;
  errors: string[];
  company_name: string;
} {
  const errors: string[] = [];
  let companyName = "";
  try {
    buildCompaniesActStatementPack(fiscalYear);
    synthesizeYojitsuFromGl(fiscalYear);
    companyName = (loadOrgCompanyReport() as Company).name;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { ok: errors.length === 0, errors, company_name: companyName };
}
