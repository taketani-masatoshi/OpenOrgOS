/**
 * Lifecycle integration: preflight → abort → retry → exclusive → annual accepts evidence.
 * Axis: integration (registry).
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeAccountingYear, listFiscalYearMonths } from "../src/lib/finance/annual-close.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { resolveCompanyFiscalYearEndMonth } from "../src/lib/finance/fiscal-year.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { evaluateIndirectTaxClose } from "../src/lib/finance/indirect-tax/port.js";
import {
  closeAccountingMonth,
  evaluateMonthlyCloseGates,
  monthCashGlDelta,
} from "../src/lib/finance/monthly-close.js";
import { postMonthJournals } from "../src/lib/finance/monthly-close-posts.js";
import {
  abortMonthlyClosePosts,
  allocateCloseEntryId,
  defaultCloseAbortOccurredAt,
  isClosePostAborted,
} from "../src/lib/finance/monthly-close-transaction.js";
import { isMonthLocked, lockMonth, resetPeriodLocksForTests } from "../src/lib/finance/period-lock.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  applyFixtureStatementRoles,
  resetFixtureCloseArtifacts,
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

const FY = "FY2026";
const MONTH = "2026-09";
const OPERATOR = "OP-TEST";

function bankPath(): string {
  return join(getDataDir(), "finance", "bank-statements.yaml");
}

function removeBank(): void {
  if (existsSync(bankPath())) unlinkSync(bankPath());
}

function statementLines(month: string): string {
  const delta = monthCashGlDelta(month);
  if (delta === 0) {
    return `  - id: BS-${month}-IN
    date: "${month}-10"
    direction: inflow
    amount: 1
    status: matched
  - id: BS-${month}-OUT
    date: "${month}-11"
    direction: outflow
    amount: 1
    status: matched`;
  }
  const direction = delta > 0 ? "inflow" : "outflow";
  return `  - id: BS-${month}
    date: "${month}-10"
    direction: ${direction}
    amount: ${Math.abs(delta)}
    status: matched`;
}

function writeTiedBank(months: string[]): void {
  writeFileSync(bankPath(), `entries:\n${months.map(statementLines).join("\n")}\n`);
}

function lockPrior(): void {
  lockMonth({ month: "2026-08", lockedBy: OPERATOR, reason: "prior month" });
}

describe("monthly close lifecycle integration", () => {
  const originalDefer = process.env.ORGOS_MONTHLY_CLOSE_DEFER_VALIDATE;

  beforeEach(() => {
    process.env.ORGOS_MONTHLY_CLOSE_DEFER_VALIDATE = "1";
    resetFixtureJournalEntries();
    applyFixtureStatementRoles();
    resetPeriodLocksForTests();
    removeBank();
  });

  afterEach(() => {
    removeBank();
    resetFixtureCloseArtifacts();
    if (originalDefer == null) delete process.env.ORGOS_MONTHLY_CLOSE_DEFER_VALIDATE;
    else process.env.ORGOS_MONTHLY_CLOSE_DEFER_VALIDATE = originalDefer;
  });

  it(
    "preflight writes nothing; abort reverses; retry locks; exclusive; annual accepts",
    () => {
      useFinanceFixtureTenant();

      // 1. Preflight failure → zero writes
      const beforePreflight = loadJournalEntries().entries.length;
      const failedPreflight = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
      expect(failedPreflight.ok).toBe(false);
      expect(failedPreflight.locked).toBe(false);
      expect(failedPreflight.posted_entry_ids).toEqual([]);
      expect(loadJournalEntries().entries.length).toBe(beforePreflight);
      expect(
        failedPreflight.evaluation.items.find((item) => item.id === "bank-imported")?.pass,
      ).toBe(false);

      // 2. Post then abort → trial back; -R{n} available
      lockPrior();
      writeTiedBank([MONTH]);
      const trialBefore = buildTrialBalance({ asOf: `${MONTH}-30` });
      const posted = postMonthJournals(MONTH, OPERATOR);
      expect(posted.length).toBeGreaterThan(0);
      const abortIds = abortMonthlyClosePosts({
        entryIds: posted,
        operatorId: OPERATOR,
        occurredAt: defaultCloseAbortOccurredAt(MONTH),
      });
      expect(abortIds.length).toBe(posted.length);
      expect(posted.every((id) => isClosePostAborted(id))).toBe(true);
      const trialAfterAbort = buildTrialBalance({ asOf: `${MONTH}-30` });
      expect(trialAfterAbort.balanced).toBe(trialBefore.balanced);
      expect(allocateCloseEntryId(`JE-PAYROLL-${MONTH}`)).toBe(`JE-PAYROLL-${MONTH}-R1`);

      // 3. Retry succeeds with lock + evidence
      const journalCountBeforeRetry = loadJournalEntries().entries.length;
      const retried = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
      expect(retried.ok).toBe(true);
      expect(retried.locked).toBe(true);
      expect(isMonthLocked(MONTH)).toBe(true);
      expect(retried.posted_entry_ids.some((id) => id.includes("-R1"))).toBe(true);
      expect(loadJournalEntries().entries.length).toBeGreaterThan(journalCountBeforeRetry);

      // 4. Exclusive re-run: refuse, no growth
      const count = loadJournalEntries().entries.length;
      const again = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
      expect(again.ok).toBe(false);
      expect(again.evaluation.errors.some((error) => error.startsWith("month-exclusive"))).toBe(
        true,
      );
      expect(again.posted_entry_ids).toEqual([]);
      expect(loadJournalEntries().entries.length).toBe(count);

      // 5. Annual close: re-lock every FY month with real close evidence
      resetPeriodLocksForTests();
      const months = listFiscalYearMonths(FY, resolveCompanyFiscalYearEndMonth());
      writeTiedBank(months);
      for (const month of months) {
        const closed = closeAccountingMonth({ month, operatorId: OPERATOR });
        expect(
          closed.ok && closed.locked,
          `${month}: ${closed.evaluation.errors.join("; ")}`,
        ).toBe(true);
      }
      const finance = join(getDataDir(), "finance");
      writeFileSync(
        join(finance, `year-end.${FY}.yaml`),
        [
          `fiscal_year: ${FY}`,
          "inventory: none",
          "accruals: []",
          "subsequent_events:",
          "  status: none",
          "consumption_tax: exempt",
          "",
        ].join("\n"),
      );
      const assetsPath = join(finance, "fixed-assets.yaml");
      const assets = readFileSync(assetsPath, "utf-8");
      if (!assets.includes("tax_depreciation_yen:")) {
        writeFileSync(
          assetsPath,
          assets.replace(
            "book_value: 4293618\n",
            "book_value: 4293618\n    tax_depreciation_yen: 106382\n",
          ),
        );
      }
      const annual = closeAccountingYear({ fiscalYear: FY, operatorId: OPERATOR });
      expect(
        annual.ok,
        annual.ok ? "" : annual.evaluation.errors.join("; "),
      ).toBe(true);
    },
    360_000,
  );

  it("skips JP consumption engine for non-JP demo tenants", () => {
    setTenantId("ee-demo");
    const result = evaluateIndirectTaxClose(MONTH, {
      missingLineTaxCodes: () => {
        throw new Error("jp engine must not run");
      },
      summarize: () => {
        throw new Error("jp engine must not run");
      },
      profileBlocking: () => {
        throw new Error("jp engine must not run");
      },
    });
    expect(result.engine).toBe("uninstalled");
    expect(result.pass).toBe(true);
    useFinanceFixtureTenant();
  });

  it("preflight gate evaluation does not require close posts", () => {
    useFinanceFixtureTenant();
    const evaluation = evaluateMonthlyCloseGates(MONTH, { phase: "preflight" });
    expect(evaluation.items.find((item) => item.id === "close-posts-deferred")?.level).toBe(
      "skip",
    );
    expect(evaluation.items.find((item) => item.id === "depreciation-posted")).toBeUndefined();
  });
});
