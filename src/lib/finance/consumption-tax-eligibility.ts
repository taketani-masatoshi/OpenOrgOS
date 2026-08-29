/**
 * Consumption-tax refund eligibility (ADR 0056).
 * Assessment only — does not write CLAIM-* or invent amounts.
 */
import type {
  ConsumptionTaxClaimKind,
  ConsumptionTaxEligibility,
  ConsumptionTaxSummary,
} from "../../../schemas/finance/consumption-tax.js";

export function assessConsumptionRefundEligibility(input: {
  summary: ConsumptionTaxSummary;
  exceptionBasis?: string;
}): ConsumptionTaxEligibility {
  const { summary } = input;
  const candidate = summary.refund_candidate_yen;
  const taxFree = summary.tax_free_sales_yen;
  const isSimplified = summary.method === "simplified";

  const kinds: ConsumptionTaxEligibility["kinds"] = [
    {
      kind: "principle_net",
      ...principleGate(isSimplified, candidate),
    },
    {
      kind: "export",
      ...exportGate(isSimplified, candidate, taxFree),
    },
    {
      kind: "simplified",
      ...simplifiedGate(input.exceptionBasis),
    },
    {
      kind: "interim",
      ...interimGate(isSimplified, candidate),
    },
  ];

  return {
    period: summary.period,
    method: summary.method,
    refund_candidate_yen: candidate,
    tax_free_sales_yen: taxFree,
    kinds,
  };
}

function principleGate(
  isSimplified: boolean,
  candidate: number,
): { gate: "open" | "blocked"; reason: string } {
  if (isSimplified) {
    return { gate: "blocked", reason: "simplified_method_selected" };
  }
  if (candidate <= 0) {
    return { gate: "blocked", reason: "not_refund_candidate" };
  }
  return { gate: "open", reason: "standard_net_refund_candidate" };
}

function exportGate(
  isSimplified: boolean,
  candidate: number,
  taxFree: number,
): { gate: "open" | "blocked"; reason: string } {
  if (isSimplified) {
    return { gate: "blocked", reason: "simplified_method_selected" };
  }
  if (taxFree <= 0) {
    return { gate: "blocked", reason: "no_export_sales" };
  }
  if (candidate <= 0) {
    return { gate: "blocked", reason: "export_allocation_deferred" };
  }
  return { gate: "open", reason: "standard_export_refund_candidate" };
}

function interimGate(
  isSimplified: boolean,
  candidate: number,
): { gate: "open" | "blocked"; reason: string } {
  if (isSimplified) {
    return { gate: "blocked", reason: "simplified_method_selected" };
  }
  if (candidate <= 0) {
    return { gate: "blocked", reason: "not_refund_candidate" };
  }
  return { gate: "open", reason: "standard_interim_refund_candidate" };
}

function simplifiedGate(
  exceptionBasis?: string,
): { gate: "open" | "blocked"; reason: string } {
  if (exceptionBasis?.trim()) {
    return { gate: "blocked", reason: "simplified_exception_requires_advisor_claim" };
  }
  return { gate: "blocked", reason: "simplified_no_input_credit" };
}

export function eligibilityForKind(
  eligibility: ConsumptionTaxEligibility,
  kind: ConsumptionTaxClaimKind,
): ConsumptionTaxEligibility["kinds"][number] {
  const line = eligibility.kinds.find((row) => row.kind === kind);
  if (!line) {
    return { kind, gate: "blocked", reason: "unknown_kind" };
  }
  return line;
}

export function formatConsumptionTaxEligibilityMarkdown(
  eligibility: ConsumptionTaxEligibility,
): string {
  return [
    `# 消費税還付 eligibility ${eligibility.period}`,
    "",
    `- 方式: ${eligibility.method}`,
    `- 還付候補: ${eligibility.refund_candidate_yen.toLocaleString()} JPY`,
    `- 輸出免税売上: ${eligibility.tax_free_sales_yen.toLocaleString()} JPY`,
    "",
    "## 種別ゲート",
    ...eligibility.kinds.map((row) => `- ${row.kind}: **${row.gate}** (${row.reason})`),
    "",
    "申請パックは `orgos operations consumption-refund`（モジュール有効時）。提出は人間。",
  ].join("\n");
}
