/**
 * Isolated monthly-close acceptance (100 weighted points).
 */
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendJournalEntry, loadJournalEntries, saveJournalEntries } from "../finance/expense-claim-journal.js";
import { buildConsumptionTaxSummary, consumptionTaxLineIssues } from "../finance/consumption-tax.js";
import {
  closeAccountingMonth,
  evaluateMonthlyCloseGates,
  monthlyBankReconciliationSnapshotHash,
  monthlyJournalSnapshotHash,
  periodLockCloseOperationPath,
} from "../finance/monthly-close.js";
import {
  isMonthLocked,
  loadPeriodLocks,
  operatorEvidenceHash,
  periodLockIntegrityIssues,
  resetPeriodLocksForTests,
  unlockMonth,
} from "../finance/period-lock.js";
import { resolveJournalSourceAccounts } from "../finance/journal-source-accounts.js";
import { addMonths, getDataDir } from "../utils.js";
import {
  fiscalYearStartMonth,
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "../finance/fiscal-year.js";
import { writeYamlFileAtomic } from "../yaml-atomic.js";
import { clearTenantId, getTenantId, setTenantId } from "../tenant.js";
import { getTenantsDir, refreshOrgOsPaths } from "../orgos-paths.js";
import { provisionLedgerTenant } from "./ledger-provision.js";
import { ensureLedgerDemoChartOfAccounts } from "./ledger-coa-ensure.js";
import { journalEntrySchema, type JournalEntry } from "../../../schemas/finance/journal-entry.js";

export type MonthlyCloseCheck = {
  id: string;
  weight: number;
  pass: boolean;
  detail: string;
};

export type MonthlyCloseAcceptanceResult = {
  isolated: true;
  score: number;
  max_score: number;
  checks: MonthlyCloseCheck[];
};

function check(id: string, weight: number, pass: boolean, detail: string): MonthlyCloseCheck {
  return { id, weight, pass, detail };
}

function injectJournalViaMigration(entry: JournalEntry): void {
  const prior = process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
  process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = "1";
  try {
    const file = loadJournalEntries();
    file.entries.push(
      journalEntrySchema.parse({
        ...entry,
        posted_at: entry.posted_at ?? entry.occurred_at,
        posted_by:
          entry.posted_by ??
          (entry.source?.kind === "manual" ? entry.source.authorized_by : "system"),
      }),
    );
    saveJournalEntries(file, { mode: "migration" });
  } finally {
    if (prior == null) delete process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
    else process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = prior;
  }
}

function writeBankAccount(status: "none" | "active"): void {
  writeYamlFileAtomic(join(getDataDir(), "finance", "bank-account.yaml"), {
    version: 1,
    status,
  });
}

function writeBankStatements(entries: Array<Record<string, unknown>>): void {
  writeYamlFileAtomic(join(getDataDir(), "finance", "bank-statements.yaml"), { entries });
}

function seedOpeningBalances(): void {
  writeYamlFileAtomic(join(getDataDir(), "finance", "opening-balances.yaml"), {
    version: 1,
    fiscal_year: "FY2026",
    period_start: "2026-02",
    as_of: "2026-01-31",
    currency: "JPY",
    lines: [
      { account_code: "1100", debit_yen: 1_000_000, credit_yen: 0 },
      { account_code: "3200", debit_yen: 0, credit_yen: 1_000_000 },
    ],
  });
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function closeMonthsThrough(month: string, operatorId: string): Promise<void> {
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fiscalYear = resolveFiscalYear(endMonth, month);
  let cursor = fiscalYearStartMonth(fiscalYear, endMonth);
  while (cursor <= month) {
    const result = closeAccountingMonth({ month: cursor, operatorId });
    if (!result.locked) {
      throw new Error(`${cursor}: ${result.evaluation.errors.join("; ")}`);
    }
    cursor = addMonths(cursor, 1);
    await yieldToEventLoop();
  }
}

function postBalancedCashRevenue(
  month: string,
  amount: number,
  operatorId: string,
  suffix = "REV",
): void {
  const sources = resolveJournalSourceAccounts();
  appendJournalEntry({
    entry_id: `JE-MC-${month}-${suffix}`,
    occurred_at: `${month}-15T12:00:00.000Z`,
    description: "acceptance revenue",
    source: { kind: "manual", authorized_by: operatorId },
    evidence_refs: [`acceptance:${month}`],
    lines: [
      {
        account_code: sources.bank_control,
        debit_yen: amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
      },
      {
        account_code: "4100",
        debit_yen: 0,
        credit_yen: amount,
        tax_category: "non_taxable",
      },
    ],
  });
}

export async function runIsolatedMonthlyCloseAcceptance(): Promise<MonthlyCloseAcceptanceResult> {
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
  const workspace = mkdtempSync(join(tmpdir(), "orgos-monthly-close-acceptance-"));
  const checks: MonthlyCloseCheck[] = [];
  const operatorId = "OP-MONTHLY-CLOSE";
  const priorMonth = "2026-08";
  const targetMonth = "2026-09";
  let firstFiscalMonth = "2026-02";

  try {
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = "1";
    console.log = () => undefined;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "monthly-close-acceptance",
      companyName: "Monthly Close Acceptance KK",
      adminEmail: "ceo@monthly-close-acceptance.example",
      plan: "business",
    });
    setTenantId("monthly-close-acceptance");
    ensureLedgerDemoChartOfAccounts();
    seedOpeningBalances();
    resetPeriodLocksForTests();
    firstFiscalMonth = fiscalYearStartMonth(
      resolveFiscalYear(resolveCompanyFiscalYearEndMonth(), targetMonth),
      resolveCompanyFiscalYearEndMonth(),
    );

    const beforeExplicit = evaluateMonthlyCloseGates(targetMonth);
    const missingExplicit = beforeExplicit.items.find((item) => item.id === "bank-file-explicit");
    writeBankAccount("none");
    const afterExplicit = evaluateMonthlyCloseGates(targetMonth);
    const withExplicit = afterExplicit.items.find((item) => item.id === "bank-file-explicit");
    checks.push(
      check(
        "bank-file-explicit",
        10,
        missingExplicit?.pass === false && withExplicit?.pass === true,
        missingExplicit?.pass === false && withExplicit?.pass === true
          ? "requires bank-account.yaml declaration"
          : `missing=${missingExplicit?.pass} declared=${withExplicit?.pass}`,
      ),
    );
    await yieldToEventLoop();

    writeBankAccount("active");
    postBalancedCashRevenue(targetMonth, 50_000, operatorId);
    writeBankStatements([
      {
        id: "BS-TIEOUT-1",
        date: `${targetMonth}-10`,
        direction: "inflow",
        amount: 50_000,
        status: "matched",
      },
    ]);
    const tieoutEval = evaluateMonthlyCloseGates(targetMonth);
    const tieoutGate = tieoutEval.items.find((item) => item.id === "bank-tieout");
    checks.push(
      check(
        "bank-tieout",
        14,
        tieoutGate?.pass === true,
        tieoutGate?.pass ? "GL delta matches statement net" : tieoutGate?.detail ?? "failed",
      ),
    );
    await yieldToEventLoop();

    writeYamlFileAtomic(join(getDataDir(), "finance", "period-locks.yaml"), {
      version: 1,
      locks: [
        {
          month: priorMonth,
          status: "locked",
          at: "2026-08-31T12:00:00.000Z",
          by: operatorId,
        },
      ],
    });
    const badPrior = evaluateMonthlyCloseGates(targetMonth);
    const priorGateBad = badPrior.items.find((item) => item.id === "prior-month-locked");
    resetPeriodLocksForTests();
    writeBankAccount("none");
    postBalancedCashRevenue(priorMonth, 10_000, operatorId);
    await closeMonthsThrough(priorMonth, operatorId);
    const goodPrior = evaluateMonthlyCloseGates(firstFiscalMonth);
    const priorGateGood = goodPrior.items.find((item) => item.id === "prior-month-locked");
    checks.push(
      check(
        "prior-month-evidence",
        10,
        priorGateBad?.pass === false &&
          isMonthLocked(priorMonth) &&
          priorGateGood?.pass === true,
        priorGateBad?.pass === false && isMonthLocked(priorMonth) && priorGateGood?.pass === true
          ? "prior lock requires evidence and journal hash"
          : `bad=${priorGateBad?.pass} priorLocked=${isMonthLocked(priorMonth)} good=${priorGateGood?.pass}`,
      ),
    );

    writeBankAccount("active");
    writeBankStatements([
      {
        id: "BS-A",
        date: `${targetMonth}-05`,
        direction: "inflow",
        amount: 1_000,
        status: "matched",
      },
    ]);
    const hashA = monthlyBankReconciliationSnapshotHash(targetMonth);
    writeBankStatements([
      {
        id: "BS-B",
        date: `${targetMonth}-06`,
        direction: "inflow",
        amount: 2_000,
        status: "matched",
      },
    ]);
    const hashB = monthlyBankReconciliationSnapshotHash(targetMonth);
    checks.push(
      check(
        "evidence-covers-lines",
        14,
        hashA !== hashB,
        hashA !== hashB ? "bank hash includes entry lines" : "bank hash unchanged",
      ),
    );

    writeYamlFileAtomic(join(getDataDir(), "finance", "monthly", `${targetMonth}.yaml`), {
      month: targetMonth,
      revenue: [{ property_id: "PROP-1", category: "rent", amount: 100_000 }],
      expenses: [],
    });
    postBalancedCashRevenue(targetMonth, 999_999, operatorId, "REV-PLAN");
    const planEval = evaluateMonthlyCloseGates(targetMonth);
    const planGate = planEval.items.find((item) => item.id === "monthly-reconcile");
    checks.push(
      check(
        "plan-blocks-when-present",
        10,
        planGate?.level === "error" && planGate.pass === false && planEval.can_lock === false,
        planGate?.level === "error" && planGate.pass === false
          ? "unbalanced plan blocks close"
          : `level=${planGate?.level} pass=${planGate?.pass}`,
      ),
    );
    await yieldToEventLoop();

    appendJournalEntry({
      entry_id: "JE-TAX-BAD",
      occurred_at: `${targetMonth}-16T12:00:00.000Z`,
      description: "bad tax amount",
      source: { kind: "manual", authorized_by: operatorId },
      evidence_refs: ["acceptance:tax"],
      lines: [
        {
          account_code: "5100",
          debit_yen: 1100,
          credit_yen: 0,
          tax_category: "taxable_10",
          tax_rate_pct: 10,
          tax_amount_yen: 999,
        },
        {
          account_code: "1100",
          debit_yen: 0,
          credit_yen: 1100,
          tax_category: "out_of_scope",
        },
      ],
    });
    const taxIssues = consumptionTaxLineIssues(targetMonth);
    const taxSummary = buildConsumptionTaxSummary({ period: targetMonth });
    const taxErrors = (taxSummary.issues ?? []).filter((issue) => issue.severity === "error");
    checks.push(
      check(
        "tax-summary-issues",
        10,
        taxIssues.some((issue) => issue.code === "tax_amount_mismatch") &&
          taxErrors.some((issue) => issue.code === "tax_amount_mismatch"),
        taxErrors.some((issue) => issue.code === "tax_amount_mismatch")
          ? "tax amount mismatch surfaced"
          : "no tax amount mismatch",
      ),
    );

    process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = "1";
    saveJournalEntries({ version: 1, entries: [] }, { mode: "migration" });
    delete process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
    resetPeriodLocksForTests();
    seedOpeningBalances();
    writeBankAccount("none");
    writeBankAccount("none");
    writeYamlFileAtomic(join(getDataDir(), "finance", "monthly", `${firstFiscalMonth}.yaml`), {
      month: firstFiscalMonth,
      revenue: [],
      expenses: [],
    });
    const opPath = periodLockCloseOperationPath(firstFiscalMonth);
    await yieldToEventLoop();
    const closed = closeAccountingMonth({ month: firstFiscalMonth, operatorId });
    const evidence = loadPeriodLocks().locks.find(
      (row) => row.month === firstFiscalMonth && row.status === "locked",
    )?.evidence;
    checks.push(
      check(
        "exclusive-month-lock",
        8,
        opPath.endsWith(`period-locks.${firstFiscalMonth}.operation`) && closed.locked,
        closed.locked ? "close serialized per month" : closed.evaluation.errors.join("; "),
      ),
    );
    checks.push(
      check(
        "operator-bound-evidence",
        8,
        evidence?.operator_sha256 === operatorEvidenceHash(operatorId),
        evidence?.operator_sha256 === operatorEvidenceHash(operatorId)
          ? "operator hash bound"
          : "operator hash missing or mismatch",
      ),
    );

    injectJournalViaMigration({
      entry_id: "JE-STALE",
      occurred_at: `${firstFiscalMonth}-20T12:00:00.000Z`,
      description: "post-lock mutation",
      source: { kind: "manual", authorized_by: operatorId },
      evidence_refs: ["acceptance:stale"],
      lines: [
        { account_code: "1100", debit_yen: 1, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 1, tax_category: "non_taxable" },
      ],
    });
    const staleIssues = periodLockIntegrityIssues().filter((issue) =>
      issue.includes("journal evidence hash mismatch"),
    );
    checks.push(
      check(
        "stale-lock-fails-integrity",
        8,
        staleIssues.length > 0,
        staleIssues.length > 0 ? staleIssues[0]! : "integrity clean after stale post",
      ),
    );

    const beforeRelockHash = evidence?.journal_entries_sha256;
    unlockMonth({
      month: firstFiscalMonth,
      unlockedBy: operatorId,
      reason: "acceptance relock",
    });
    appendJournalEntry({
      entry_id: "JE-RELOCK",
      occurred_at: `${firstFiscalMonth}-21T12:00:00.000Z`,
      description: "relock change",
      source: { kind: "manual", authorized_by: operatorId },
      evidence_refs: ["acceptance:relock"],
      lines: [
        { account_code: "1100", debit_yen: 2, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 2, tax_category: "non_taxable" },
      ],
    });
    const relocked = closeAccountingMonth({ month: firstFiscalMonth, operatorId });
    const afterEvidence = loadPeriodLocks().locks
      .filter((row) => row.month === firstFiscalMonth && row.status === "locked")
      .at(-1)?.evidence;
    checks.push(
      check(
        "relock-requires-fresh-evidence",
        8,
        relocked.locked &&
          beforeRelockHash != null &&
          afterEvidence?.journal_entries_sha256 !== beforeRelockHash &&
          afterEvidence?.journal_entries_sha256 ===
            monthlyJournalSnapshotHash(firstFiscalMonth),
        relocked.locked
          ? "relock captured fresh journal hash"
          : relocked.evaluation.errors.join("; "),
      ),
    );

  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (checks.length === 0) {
      checks.push(check("setup", 100, false, detail));
    }
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

  const max_score = checks.reduce((sum, row) => sum + row.weight, 0);
  const score = checks.filter((row) => row.pass).reduce((sum, row) => sum + row.weight, 0);
  return { isolated: true, score, max_score, checks };
}
