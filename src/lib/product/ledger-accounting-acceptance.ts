/**
 * Destructive accounting acceptance executed only inside a disposable workspace.
 * It proves the library path from provisioning through annual close without
 * reading or writing a deployed tenant.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeAccountingYear, listFiscalYearMonths } from "../finance/annual-close.js";
import { calculateConsumptionTaxFilingAmounts } from "../finance/consumption-tax-filing.js";
import { buildConsumptionTaxFilingDraft } from "../finance/consumption-tax-filing.js";
import { loadJournalEntries, saveJournalEntries } from "../finance/expense-claim-journal.js";
import { runValidateReport } from "../../commands/validate.js";
import {
  fiscalYearStartDate,
  fiscalYearStartMonth,
  resolveCompanyFiscalYearEndMonth,
} from "../finance/fiscal-year.js";
import { closeAccountingMonth } from "../finance/monthly-close.js";
import { getDataDir } from "../utils.js";
import { writeYamlFileAtomic } from "../yaml-atomic.js";
import { clearTenantId, getTenantId, setTenantId } from "../tenant.js";
import { getTenantsDir, refreshOrgOsPaths } from "../orgos-paths.js";
import { runBankImportReconcileE2E } from "./ledger-bank-e2e.js";
import { provisionLedgerTenant } from "./ledger-provision.js";
import { seedLedgerDemoYear } from "./ledger-seed-demo-year.js";

export type AccountingAcceptanceStep = {
  pass: boolean;
  detail: string;
};

export type AccountingAcceptanceResult = {
  isolated: true;
  journal: AccountingAcceptanceStep;
  bank_reconcile: AccountingAcceptanceStep;
  monthly_close: AccountingAcceptanceStep;
  annual_close: AccountingAcceptanceStep;
  consumption_tax: AccountingAcceptanceStep;
};

const NOT_RUN: AccountingAcceptanceStep = { pass: false, detail: "not run" };

export function runIsolatedAccountingAcceptance(): AccountingAcceptanceResult {
  const originalWorkspace = process.env.ORGOS_WORKSPACE;
  const originalSkipBackup = process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
  const originalConsoleLog = console.log;
  const originalTenant = (() => {
    try {
      return getTenantId();
    } catch {
      return null;
    }
  })();
  const workspace = mkdtempSync(join(tmpdir(), "orgos-accounting-acceptance-"));
  const result: AccountingAcceptanceResult = {
    isolated: true,
    journal: { ...NOT_RUN },
    bank_reconcile: { ...NOT_RUN },
    monthly_close: { ...NOT_RUN },
    annual_close: { ...NOT_RUN },
    consumption_tax: { ...NOT_RUN },
  };

  try {
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = "1";
    console.log = () => undefined;
    refreshOrgOsPaths();
    const tenantId = "accounting-acceptance";
    provisionLedgerTenant({
      tenantId,
      companyName: "Accounting Acceptance KK",
      adminEmail: "ceo@accounting-acceptance.example",
      plan: "business",
    });
    setTenantId(tenantId);

    const fiscalYear = "FY2026";
    const fiscalYearEndMonth = resolveCompanyFiscalYearEndMonth();
    const startDate = new Date(`${fiscalYearStartDate(fiscalYear, fiscalYearEndMonth)}T00:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - 1);
    writeYamlFileAtomic(join(getDataDir(), "finance", "opening-balances.yaml"), {
      version: 1,
      fiscal_year: fiscalYear,
      period_start: fiscalYearStartMonth(fiscalYear, fiscalYearEndMonth),
      as_of: startDate.toISOString().slice(0, 10),
      currency: "JPY",
      lines: [],
      notes: "Isolated accounting acceptance opening balance",
    });
    const seeded = seedLedgerDemoYear({ fiscalYear, force: true });
    const codes = seeded.account_codes;
    if (!codes) throw new Error("demo account codes missing");
    const taxableEntries = loadJournalEntries().entries.map((entry) => ({
      ...entry,
      lines: entry.lines.map((line) => {
        if (line.account_code === codes.revenue && line.credit_yen > 0) {
          return { ...line, tax_category: "taxable_10" as const, tax_basis: "exclusive" as const };
        }
        if (line.account_code === codes.expense && line.debit_yen > 0) {
          return {
            ...line,
            tax_category: "taxable_10" as const,
            tax_basis: "exclusive" as const,
            invoice_status: "qualified" as const,
            purchase_use: "taxable_only" as const,
          };
        }
        return line;
      }),
    }));
    saveJournalEntries({ version: 1, entries: taxableEntries }, { mode: "migration" });
    writeYamlFileAtomic(join(getDataDir(), "finance", "tax-profile.yaml"), {
      entity: { name: "Accounting Acceptance KK", type: "株式会社" },
      fiscal_year: { end_month: fiscalYearEndMonth },
      consumption_tax: {
        status: "課税事業者",
        method: "standard",
        taxpayer_basis: "base_period",
        base_period_sales_jpy: 12_000_000,
        purchase_allocation_method: "individual",
        prior_period_national_tax_yen: 0,
        interim_filing_frequency: "none",
        business_operator_kind: "domestic",
        advisor_reviews: [{ fiscal_year: fiscalYear, status: "pending" }],
      },
      corporate_tax: {},
    });
    writeYamlFileAtomic(join(getDataDir(), "finance", `year-end.${fiscalYear}.yaml`), {
      fiscal_year: fiscalYear,
      inventory: "none",
      accruals: [],
      subsequent_events: { status: "none" },
      consumption_tax: "calculated",
    });
    result.journal = {
      pass: seeded.posted_entry_ids.length === 24,
      detail: `${seeded.posted_entry_ids.length}/24 journals posted`,
    };
    if (!result.journal.pass) return result;

    const bank = runBankImportReconcileE2E({ authorizedBy: "OP-ACCEPTANCE" });
    result.bank_reconcile = {
      pass: bank.imported > 0 && bank.applied != null,
      detail: `imported=${bank.imported}, applied=${bank.applied?.entry_id ?? "none"}, unmatched=${bank.workbench_unmatched_after}`,
    };
    if (!result.bank_reconcile.pass) return result;

    const months = listFiscalYearMonths(fiscalYear, resolveCompanyFiscalYearEndMonth());
    writeYamlFileAtomic(join(getDataDir(), "finance", "bank-statements.yaml"), {
      entries: months.map((month, index) => ({
        id: `BS-ACCEPTANCE-${String(index + 1).padStart(2, "0")}`,
        date: `${month}-15`,
        direction: "inflow",
        amount: 1,
        status: "matched",
      })),
    });
    const preCloseValidate = runValidateReport({ warnings: true });
    const monthly = months.map((month) =>
      closeAccountingMonth({
        month,
        operatorId: "OP-ACCEPTANCE",
        validateReport: preCloseValidate,
      }),
    );
    const closedMonths = monthly.filter((row) => row.ok && row.locked).length;
    const postCloseValidate = runValidateReport({ warnings: true });
    const financeErrors = postCloseValidate.issues.filter(
      (issue) => issue.severity === "error" && issue.path.includes("data/finance/"),
    );
    result.monthly_close = {
      pass: closedMonths === months.length && financeErrors.length === 0,
      detail: `${closedMonths}/${months.length} months locked; finance errors=${financeErrors.length}`,
    };
    if (!result.monthly_close.pass) {
      const failed = monthly.find((row) => !row.ok || !row.locked);
      result.monthly_close.detail += failed
        ? `; ${failed.month}: ${failed.evaluation.errors.join("; ")}`
        : "";
      return result;
    }

    const annual = closeAccountingYear({ fiscalYear, operatorId: "OP-ACCEPTANCE" });
    result.annual_close = {
      pass: annual.ok && annual.opening_proposal_path != null,
      detail: annual.ok
        ? `committed; posted=${annual.posted_entry_ids.length}`
        : annual.evaluation.errors.join("; "),
    };
    const standard10 = calculateConsumptionTaxFilingAmounts({
      taxable_sales_10_yen: 10_000_000,
      taxable_sales_8_yen: 0,
      deductible_input_tax_yen: 0,
    });
    const reduced8 = calculateConsumptionTaxFilingAmounts({
      taxable_sales_10_yen: 0,
      taxable_sales_8_yen: 10_000_000,
      deductible_input_tax_yen: 0,
    });
    const filingRounding = calculateConsumptionTaxFilingAmounts({
      taxable_sales_10_yen: 1_234_567,
      taxable_sales_8_yen: 0,
      deductible_input_tax_yen: 0,
    });
    const filingDraft = buildConsumptionTaxFilingDraft(fiscalYear);
    result.consumption_tax = {
      pass:
        standard10.national_tax_yen === 780_000 &&
        standard10.local_consumption_tax_yen === 220_000 &&
        standard10.combined_tax_yen === 1_000_000 &&
        reduced8.national_tax_yen === 624_000 &&
        reduced8.local_consumption_tax_yen === 176_000 &&
        reduced8.combined_tax_yen === 800_000 &&
        filingRounding.taxable_base_10_yen === 1_234_000 &&
        filingRounding.national_tax_yen === 96_200 &&
        filingRounding.local_consumption_tax_yen === 27_100 &&
        filingDraft.status === "ready_for_advisor_review" &&
        filingDraft.submission === "not-for-etax" &&
        filingDraft.blockers.length === 0,
      detail: `10%=${standard10.combined_tax_yen}, 8%=${reduced8.combined_tax_yen}, rounded=${filingRounding.combined_tax_yen}, filing=${filingDraft.status}`,
    };
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const target = (Object.entries(result) as Array<
      [keyof AccountingAcceptanceResult, AccountingAcceptanceResult[keyof AccountingAcceptanceResult]]
    >).find(([, value]) => typeof value === "object" && "detail" in value && value.detail === "not run");
    if (target && target[0] !== "isolated") {
      result[target[0]] = { pass: false, detail } as never;
    }
    return result;
  } finally {
    if (originalWorkspace == null) delete process.env.ORGOS_WORKSPACE;
    else process.env.ORGOS_WORKSPACE = originalWorkspace;
    if (originalSkipBackup == null) delete process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
    else process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = originalSkipBackup;
    console.log = originalConsoleLog;
    refreshOrgOsPaths();
    clearTenantId();
    if (originalTenant && existsSync(join(getTenantsDir(), originalTenant, "tenant.yaml"))) {
      setTenantId(originalTenant);
    }
    rmSync(workspace, { recursive: true, force: true });
  }
}
