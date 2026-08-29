// @catalog-ids: jp_consumption_refund
import { describe, expect, it } from "vitest";
import type { ConsumptionTaxSummary } from "../schemas/finance/consumption-tax.js";
import { buildConsumptionTaxSummary } from "../src/lib/finance/consumption-tax.js";
import { assessConsumptionRefundEligibility } from "../src/lib/finance/consumption-tax-eligibility.js";
import {
  applyClaimStatus,
  assertPackable,
  proposeClaimFromAssessment,
  validateClaims,
} from "../steward/jurisdiction-packs/JP/modules/jp_consumption_refund/cli/lib.js";
import type { ConsumptionRefundClaim } from "../steward/jurisdiction-packs/JP/modules/jp_consumption_refund/cli/schema.js";
import type { ConsumptionRefundClaimsFile } from "../steward/jurisdiction-packs/JP/modules/jp_consumption_refund/cli/schema.js";
import {
  REFUND_CASHFLOW_CATEGORY,
  addIsoDays,
  buildRefundReceiveJournal,
  expectedRefundReceivedOn,
  refundCalendarItemsFromClaims,
  refundReceiveJournalId,
} from "../src/lib/finance/consumption-tax-refund-receipt.js";
import { journalEntrySchema } from "../schemas/finance/journal-entry.js";

function summary(
  overrides: Partial<ConsumptionTaxSummary> &
    Pick<ConsumptionTaxSummary, "period" | "method">,
): ConsumptionTaxSummary {
  return {
    output_tax_yen: 0,
    input_tax_yen: 0,
    net_tax_yen: 0,
    refund_candidate_yen: 0,
    direction: "payable",
    exempt_sales_yen: 0,
    tax_free_sales_yen: 0,
    lines: [],
    ...overrides,
  };
}

describe("consumption tax calc (R0/R1)", () => {
  it("labels a principle refund candidate and keeps tax_free sales", () => {
    const result = buildConsumptionTaxSummary({
      period: "2026-03",
      method: "standard",
      manual: {
        taxable_sales_10_yen: 1_000_000,
        taxable_purchases_10_yen: 2_000_000,
        tax_free_sales_yen: 5_000_000,
      },
    });
    expect(result.output_tax_yen).toBe(100_000);
    expect(result.input_tax_yen).toBe(200_000);
    expect(result.net_tax_yen).toBe(-100_000);
    expect(result.refund_candidate_yen).toBe(100_000);
    expect(result.direction).toBe("refund_candidate");
    expect(result.tax_free_sales_yen).toBe(5_000_000);
  });

  it("does not treat simplified deemed purchase as a refund", () => {
    const result = buildConsumptionTaxSummary({
      period: "2026-03",
      method: "simplified",
      deemedPurchaseRatePct: 90,
      manual: {
        taxable_sales_10_yen: 1_000_000,
        taxable_purchases_10_yen: 2_000_000,
      },
    });
    expect(result.input_tax_yen).toBe(90_000);
    expect(result.net_tax_yen).toBe(10_000);
    expect(result.direction).toBe("payable");
    expect(result.refund_candidate_yen).toBe(0);
  });
});

describe("consumption tax eligibility", () => {
  it("opens principle_net and export on a standard refund candidate with exports", () => {
    const eligibility = assessConsumptionRefundEligibility({
      summary: summary({
        period: "2026-03",
        method: "standard",
        refund_candidate_yen: 80_000,
        direction: "refund_candidate",
        tax_free_sales_yen: 1_000_000,
      }),
    });
    expect(eligibility.kinds.find((row) => row.kind === "principle_net")).toMatchObject({
      gate: "open",
    });
    expect(eligibility.kinds.find((row) => row.kind === "export")).toMatchObject({
      gate: "open",
    });
    expect(eligibility.kinds.find((row) => row.kind === "simplified")).toMatchObject({
      gate: "blocked",
      reason: "simplified_no_input_credit",
    });
    expect(eligibility.kinds.find((row) => row.kind === "interim")).toMatchObject({
      gate: "open",
      reason: "standard_interim_refund_candidate",
    });
  });

  it("keeps simplified blocked even with exception_basis", () => {
    const eligibility = assessConsumptionRefundEligibility({
      summary: summary({ period: "2026-03", method: "simplified" }),
      exceptionBasis: "docs/company/tax/advisor-memo.md",
    });
    expect(eligibility.kinds.find((row) => row.kind === "simplified")).toMatchObject({
      gate: "blocked",
      reason: "simplified_exception_requires_advisor_claim",
    });
    expect(eligibility.kinds.find((row) => row.kind === "principle_net")).toMatchObject({
      gate: "blocked",
      reason: "simplified_method_selected",
    });
  });
});

describe("consumption refund propose / validate", () => {
  it("copies Assessment amount for an open principle_net claim", () => {
    const claim = proposeClaimFromAssessment({
      summary: summary({
        period: "2026-03",
        method: "standard",
        refund_candidate_yen: 80_000,
        direction: "refund_candidate",
      }),
      kind: "principle_net",
    });
    expect(claim.id).toBe("CLAIM-2026-03-principle_net");
    expect(claim.amount_yen).toBe(80_000);
    expect(claim.status).toBe("draft");
    expect(claim.gate).toBe("open");
  });

  it("rejects simplified without exception_basis and allows advisor draft only", () => {
    const blockedSummary = summary({ period: "2026-03", method: "simplified" });
    expect(() =>
      proposeClaimFromAssessment({ summary: blockedSummary, kind: "simplified" }),
    ).toThrow(/simplified_no_input_credit/);

    const draft = proposeClaimFromAssessment({
      summary: blockedSummary,
      kind: "simplified",
      exceptionBasis: "docs/company/tax/advisor-memo.md",
    });
    expect(draft.status).toBe("draft");
    expect(draft.gate).toBe("blocked");
    expect(draft.gate_reason).toBe("simplified_exception_requires_advisor_claim");
    expect(draft.amount_yen).toBe(0);
  });

  it("rejects a second open claim in the same period", () => {
    const file: ConsumptionRefundClaimsFile = {
      entity: "example",
      claims: [
        {
          id: "CLAIM-2026-03-principle_net",
          kind: "principle_net",
          period: "2026-03",
          assessment_period: "2026-03",
          amount_yen: 1,
          status: "draft",
          gate: "open",
          gate_reason: "standard_net_refund_candidate",
          evidence_paths: [],
        },
        {
          id: "CLAIM-2026-03-export",
          kind: "export",
          period: "2026-03",
          assessment_period: "2026-03",
          amount_yen: 1,
          status: "ready_to_file",
          gate: "open",
          gate_reason: "standard_export_refund_candidate",
          evidence_paths: ["docs/company/tax/refund/export-evidence.md"],
        },
      ],
    };
    expect(validateClaims(file).some((issue) => issue.includes("multiple open"))).toBe(true);
  });

  it("blocks interim when there is no refund candidate", () => {
    const eligibility = assessConsumptionRefundEligibility({
      summary: summary({ period: "2026-03", method: "standard" }),
    });
    expect(eligibility.kinds.find((row) => row.kind === "interim")).toMatchObject({
      gate: "blocked",
      reason: "not_refund_candidate",
    });
  });

  it("requires export evidence before packing", () => {
    expect(() =>
      assertPackable({
        id: "CLAIM-2026-03-export",
        kind: "export",
        period: "2026-03",
        assessment_period: "2026-03",
        amount_yen: 1,
        status: "draft",
        gate: "open",
        gate_reason: "standard_export_refund_candidate",
        evidence_paths: [],
      }),
    ).toThrow(/evidence_paths/);
  });
});

const filedClaim = (): ConsumptionRefundClaim => ({
  id: "CLAIM-2026-03-principle_net",
  kind: "principle_net",
  period: "2026-03",
  assessment_period: "2026-03",
  amount_yen: 80_000,
  status: "ready_to_file",
  gate: "open",
  gate_reason: "standard_net_refund_candidate",
  evidence_paths: [],
});

describe("consumption refund R3 cash / GL", () => {
  it("only advances status forward and keeps amount_yen", () => {
    const filed = applyClaimStatus(filedClaim(), "filed_by_human", { filed_on: "2026-04-15" });
    expect(filed.status).toBe("filed_by_human");
    expect(filed.amount_yen).toBe(80_000);
    expect(() => applyClaimStatus(filed, "draft")).toThrow(/cannot move/);
    expect(() =>
      applyClaimStatus(filed, "received", { amount_yen: 1, received_on: "2026-06-01" }),
    ).toThrow(/immutable/);
  });

  it("builds a balanced receive journal against 仮払消費税", () => {
    const claim = applyClaimStatus(filedClaim(), "filed_by_human", { filed_on: "2026-04-15" });
    const entry = buildRefundReceiveJournal({
      claim,
      receivedOn: "2026-06-01",
      bankAccountCode: "1100",
      taxReceivableAccountCode: "2170",
      bankAccountId: "BANK-OPERATING",
    });
    expect(entry.entry_id).toBe(refundReceiveJournalId(claim.id));
    expect(entry.entry_id).toMatch(/^JE-[A-Z0-9-]+$/);
    expect(entry.source).toEqual({
      kind: "consumption_tax_refund",
      claim_id: claim.id,
      event: "refund_received",
    });
    expect(entry.lines[0]).toMatchObject({
      account_code: "1100",
      debit_yen: 80_000,
      source_bank_account_id: "BANK-OPERATING",
    });
    expect(entry.lines[1]).toMatchObject({
      account_code: "2170",
      credit_yen: 80_000,
    });
    expect(journalEntrySchema.parse(entry).entry_id).toBe(entry.entry_id);
    expect(() =>
      buildRefundReceiveJournal({
        claim: { ...claim, amount_yen: 0 },
        receivedOn: "2026-06-01",
        bankAccountCode: "1100",
        taxReceivableAccountCode: "2170",
      }),
    ).toThrow(/amount_yen/);
  });

  it("schedules an inflow from filed claims without counting it as tax outflow", () => {
    const filed = applyClaimStatus(filedClaim(), "filed_by_human", { filed_on: "2026-04-15" });
    expect(expectedRefundReceivedOn(filed)).toBe(addIsoDays("2026-04-15", 45));
    const items = refundCalendarItemsFromClaims([filed]);
    expect(items).toHaveLength(1);
    expect(items[0].cashflow_category).toBe(REFUND_CASHFLOW_CATEGORY);
    expect(items[0].amount_estimate_jpy).toBe(80_000);
    expect(items[0].deadline).toBe("2026-05-30");
  });
});
