/**
 * Consumption-tax refund cash / GL (ADR 0056 R3).
 * Amounts are copied from CLAIM-*. Do not invent.
 */
import { z } from "zod";
import type { JournalEntry } from "../../../schemas/finance/journal-entry.js";
import { journalEntrySchema } from "../../../schemas/finance/journal-entry.js";
import { loadModuleDataFile } from "../module-business-data.js";

export const REFUND_CASHFLOW_CATEGORY = "consumption_tax_refund";
const EXPECTED_RECEIPT_LAG_DAYS = 45;

export type RefundClaimStatus =
  | "draft"
  | "blocked"
  | "advisor_review"
  | "ready_to_file"
  | "filed_by_human"
  | "received"
  | "rejected";

export type RefundClaimSlice = {
  id: string;
  period: string;
  amount_yen: number;
  status: RefundClaimStatus;
  filed_on?: string;
  expected_received_on?: string;
  refund_bank_account_id?: string;
};

const ALLOWED_ADVANCES: Record<RefundClaimStatus, RefundClaimStatus[]> = {
  blocked: [],
  draft: ["advisor_review", "ready_to_file", "rejected"],
  advisor_review: ["ready_to_file", "rejected"],
  ready_to_file: ["filed_by_human", "rejected"],
  filed_by_human: ["received", "rejected"],
  received: [],
  rejected: [],
};

export function assertClaimStatusAdvance(
  from: RefundClaimStatus,
  to: RefundClaimStatus,
): void {
  if (!ALLOWED_ADVANCES[from].includes(to)) {
    throw new Error(`claim status cannot move ${from} → ${to}`);
  }
}

export function refundReceiveJournalId(claimId: string): string {
  const match = claimId.match(/^CLAIM-(\d{4})-(\d{2})-(.+)$/);
  const year = match?.[1] ?? "0000";
  const month = match?.[2] ?? "00";
  const slug = (match?.[3] ?? "X").replace(/_/g, "-").toUpperCase();
  return `JE-CTREF-${year}${month}-${slug}-RCV`;
}

export function addIsoDays(isoDate: string, days: number): string {
  const utc = new Date(`${isoDate}T00:00:00.000Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function expectedRefundReceivedOn(claim: RefundClaimSlice): string | undefined {
  if (claim.expected_received_on) return claim.expected_received_on;
  if (claim.filed_on) return addIsoDays(claim.filed_on, EXPECTED_RECEIPT_LAG_DAYS);
  return undefined;
}

export function buildRefundReceiveJournal(input: {
  claim: Pick<RefundClaimSlice, "id" | "amount_yen" | "refund_bank_account_id">;
  receivedOn: string;
  bankAccountCode: string;
  taxReceivableAccountCode: string;
  bankAccountId?: string;
}): JournalEntry {
  const amount = input.claim.amount_yen;
  if (amount <= 0) {
    throw new Error(`${input.claim.id}: receive requires amount_yen > 0`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn)) {
    throw new Error(`receivedOn must be YYYY-MM-DD`);
  }
  const bankAccountId = input.bankAccountId ?? input.claim.refund_bank_account_id;
  return journalEntrySchema.parse({
    entry_id: refundReceiveJournalId(input.claim.id),
    occurred_at: `${input.receivedOn}T00:00:00.000Z`,
    description: `Consumption tax refund received ${input.claim.id}`,
    source: {
      kind: "consumption_tax_refund",
      claim_id: input.claim.id,
      event: "refund_received",
    },
    evidence_refs: [`claim:${input.claim.id}`],
    lines: [
      {
        account_code: input.bankAccountCode,
        debit_yen: amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
        source_bank_account_id: bankAccountId,
      },
      {
        account_code: input.taxReceivableAccountCode,
        debit_yen: 0,
        credit_yen: amount,
        tax_category: "out_of_scope",
      },
    ],
  });
}

export type RefundCalendarItem = {
  id: string;
  tax: string;
  period_label: string;
  deadline?: string;
  status: string;
  amount_estimate_jpy: number;
  cashflow_category: typeof REFUND_CASHFLOW_CATEGORY;
};

export function refundCalendarItemsFromClaims(
  claims: RefundClaimSlice[],
): RefundCalendarItem[] {
  return claims
    .filter(
      (claim) =>
        (claim.status === "filed_by_human" || claim.status === "received") &&
        claim.amount_yen > 0,
    )
    .map((claim) => ({
      id: `obl-consumption-refund-${claim.id}`,
      tax: "消費税還付入金予定",
      period_label: claim.period,
      deadline: expectedRefundReceivedOn(claim),
      status: claim.status === "received" ? "received" : "open",
      amount_estimate_jpy: claim.amount_yen,
      cashflow_category: REFUND_CASHFLOW_CATEGORY,
    }));
}

export function openRefundClaimAmountYen(claims: RefundClaimSlice[]): number {
  return claims
    .filter((claim) => claim.status === "filed_by_human")
    .reduce((sum, claim) => sum + claim.amount_yen, 0);
}

const liveClaimsFileSchema = z.object({
  claims: z
    .array(
      z.object({
        id: z.string(),
        period: z.string(),
        amount_yen: z.number().int().nonnegative(),
        status: z.enum([
          "draft",
          "blocked",
          "advisor_review",
          "ready_to_file",
          "filed_by_human",
          "received",
          "rejected",
        ]),
        filed_on: z.string().optional(),
        expected_received_on: z.string().optional(),
        refund_bank_account_id: z.string().optional(),
      }),
    )
    .default([]),
});

/** Tenant live CLAIM file only — never the catalog seed. */
export function loadLiveRefundClaimsForCalendar(): RefundClaimSlice[] {
  try {
    const loaded = loadModuleDataFile(
      "jp_consumption_refund",
      "consumption-refund-claims.yaml",
      liveClaimsFileSchema,
      { source: "tenant-live" },
    );
    return loaded?.data.claims ?? [];
  } catch {
    return [];
  }
}
