import { describe, expect, it } from "vitest";
import * as monthlyClose from "../src/lib/finance/monthly-close.js";
import * as taxAdjustment from "../src/lib/finance/tax-adjustment.js";
import * as expenseClaim from "../src/lib/finance/expense-claim.js";
import * as corporateLocalTax from "../src/lib/finance/corporate-local-tax.js";
import * as solePropConsumptionTax from "../src/lib/finance/sole-prop-consumption-tax.js";
import {
  evaluateMonthlyCloseGates,
} from "../src/lib/finance/monthly-close.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

/** Public surface pin — move-only splits must not drop or rename these. */
describe("finance public export baseline", () => {
  it("pins monthly-close.js exports", () => {
    expect(Object.keys(monthlyClose).sort()).toEqual([
      "buildMonthlyCloseEvidence",
      "closeAccountingMonth",
      "evaluateInventoryCloseGate",
      "evaluateMonthlyCloseGates",
      "monthBankTieOut",
      "monthCashGlDelta",
      "monthlyJournalSnapshotHash",
      "scoreCashbookExample",
      "unmatchedBankCountForMonth",
    ]);
  });

  it("pins tax-adjustment.js exports", () => {
    expect(Object.keys(taxAdjustment).sort()).toEqual([
      "ARAMASHI_EXAMPLE_CORPORATE_TAX_YEN",
      "ARAMASHI_EXAMPLE_INCOME_YEN",
      "ARAMASHI_EXAMPLE_LOCAL_BASE_YEN",
      "ARAMASHI_EXAMPLE_LOCAL_TAX_YEN",
      "CORPORATE_TAX_FORM_EDITION",
      "REIWA6_SCHEDULE4_EXAMPLE_INCOME_YEN",
      "corporateNationalLocalStatutoryMet",
      "diffSchedule1NationalLocalExample",
      "diffSchedule4OfficialExample",
      "evaluateTaxAdjustment",
      "localCorporateTaxAmountYen",
      "localCorporateTaxBaseYen",
      "localCorporateTaxYen",
      "schedule1NationalLocalExample",
      "schedule4AgriculturalReserveExample",
      "schedule4StatutoryMet",
      "scoreNationalLocalWorkedExample",
      "scoreSchedule4WorkedExample",
    ]);
  });

  it("pins expense-claim.js exports", () => {
    expect(Object.keys(expenseClaim).sort()).toEqual([
      "ExpenseClaimItemRevisionConflictError",
      "ExpenseClaimsRevisionConflictError",
      "approveExpenseClaim",
      "assertExpectedClaimRevision",
      "assertExpectedClaimsRevision",
      "buildReceiptWireClaimPayload",
      "bumpAndSaveExpenseClaims",
      "claimAllocations",
      "claimRevision",
      "computeExpenseClaimRemaining",
      "defaultReimbursementDueOn",
      "evaluateExpenseClaimDeadline",
      "evaluateExpenseClaimGate",
      "expenseClaimsPath",
      "expenseClaimsRevision",
      "findExpenseClaim",
      "ingestExpenseReceiptQr",
      "listExpenseClaims",
      "loadExpenseClaims",
      "markExpenseClaimReimbursed",
      "postExpenseClaim",
      "prepareExpenseClaimReimbursementTransfer",
      "proposeExpenseClaimFromReceipt",
      "rejectExpenseClaim",
      "requestWireReceiptClaimBestEffort",
      "resolveIssuerWireReady",
      "saveExpenseClaims",
      "withExpenseClaimsLock",
    ]);
  });

  it("pins corporate-local-tax.js exports", () => {
    expect(Object.keys(corporateLocalTax).sort()).toEqual([
      "computeCorporateLocalTax",
      "computeCorporateLocalTaxFromAdjustment",
      "diffCorporateLocalTaxLines",
    ]);
  });

  it("pins sole-prop-consumption-tax.js exports", () => {
    expect(Object.keys(solePropConsumptionTax).sort()).toEqual([
      "SOLE_PROP_CONSUMPTION_MARKS",
      "SOLE_PROP_CONSUMPTION_REQUIRED_PAGE1_LINES",
      "fillSolePropConsumptionReturn",
      "scoreSolePropConsumptionTax",
      "scoreSolePropConsumptionYen",
      "solePropConsumptionFormulas",
      "solePropConsumptionRequiredPage1LinesPresent",
      "solePropConsumptionStatutoryMet",
      "solePropConsumptionYenDiff",
    ]);
  });
});

describe("monthly close gate golden order", () => {
  it("returns stable gate ids and levels on fixture preflight", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const evaluation = evaluateMonthlyCloseGates("2026-09", { phase: "preflight" });
    expect(
      evaluation.items.map((item) => ({
        id: item.id,
        level: item.level,
        pass: item.pass,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "id": "close-posts-deferred",
          "level": "skip",
          "pass": true,
        },
        {
          "id": "prior-month-locked",
          "level": "error",
          "pass": false,
        },
        {
          "id": "trial-balance",
          "level": "error",
          "pass": true,
        },
        {
          "id": "cash-ending",
          "level": "error",
          "pass": true,
        },
        {
          "id": "balance-sheet",
          "level": "error",
          "pass": true,
        },
        {
          "id": "subsidiary",
          "level": "error",
          "pass": true,
        },
        {
          "id": "bank-imported",
          "level": "error",
          "pass": false,
        },
        {
          "id": "bank-unmatched",
          "level": "error",
          "pass": false,
        },
        {
          "id": "bank-gl-tieout",
          "level": "error",
          "pass": false,
        },
        {
          "id": "prior-evidence",
          "level": "skip",
          "pass": true,
        },
        {
          "id": "inventory-cogs",
          "level": "skip",
          "pass": true,
        },
        {
          "id": "consumption-tax",
          "level": "error",
          "pass": true,
        },
        {
          "id": "validate",
          "level": "skip",
          "pass": true,
        },
        {
          "id": "monthly-reconcile",
          "level": "warning",
          "pass": false,
        },
      ]
    `);
  });
});
