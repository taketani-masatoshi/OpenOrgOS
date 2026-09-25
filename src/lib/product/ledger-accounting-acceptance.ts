/**
 * Destructive accounting acceptance executed only inside a disposable workspace.
 * It proves the library path from provisioning through annual close without
 * reading or writing a deployed tenant.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeAccountingYear, listFiscalYearMonths } from "../finance/annual-close.js";
import { runValidateReport } from "../../commands/validate.js";
import { resolveCompanyFiscalYearEndMonth } from "../finance/fiscal-year.js";
import { closeAccountingMonth } from "../finance/monthly-close.js";
import { reconciliationEventPath } from "../jp-bank-corporate/reconciliation-store.js";
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
    const seeded = seedLedgerDemoYear({ fiscalYear, force: true });
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
    // Bank e2e leaves reconciliation-events tied to import IDs. Rewriting
    // statements for monthly-close without clearing events makes
    // loadBankStatementsLite replay fail → "bank statements unreadable".
    const eventsPath = reconciliationEventPath();
    if (existsSync(eventsPath)) rmSync(eventsPath, { force: true });
    writeYamlFileAtomic(join(getDataDir(), "finance", "bank-statements.yaml"), {
      entries: months.map((month, index) => ({
        id: `BS-ACCEPTANCE-${String(index + 1).padStart(2, "0")}`,
        date: `${month}-15`,
        direction: "inflow",
        amount: 1,
        status: "matched",
      })),
    });
    const monthly = months.map((month) =>
      closeAccountingMonth({
        month,
        operatorId: "OP-ACCEPTANCE",
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

    writeYamlFileAtomic(join(getDataDir(), "finance", `year-end.${fiscalYear}.yaml`), {
      fiscal_year: fiscalYear,
      inventory: "none",
      accruals: [],
      subsequent_events: { status: "none" },
      consumption_tax: "exempt",
    });

    const annual = closeAccountingYear({ fiscalYear, operatorId: "OP-ACCEPTANCE" });
    result.annual_close = {
      pass: annual.ok && annual.opening_proposal_path != null,
      detail: annual.ok
        ? `committed; posted=${annual.posted_entry_ids.length}`
        : annual.evaluation.errors.join("; "),
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
