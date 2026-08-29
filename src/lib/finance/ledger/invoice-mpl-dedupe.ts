/**
 * Invoice JE vs monthly P/L (JE-MPL) — property-scoped dedupe.
 * Month-wide skip is wrong: invoice-only months and other properties must still post.
 */
import { loadJournalEntries } from "../expense-claim-journal.js";

export type InvoicePropertyScope = {
  propertyId?: string;
  period: string;
};

export function resolveInvoicePropertyScope(input: {
  invoiceId: string;
  propertyId?: string;
  occurredAt: string;
}): InvoicePropertyScope {
  const period = input.occurredAt.slice(0, 7);
  if (input.propertyId) {
    return { propertyId: input.propertyId, period };
  }
  const match = input.invoiceId.match(/^(.+)-(\d{4}-\d{2})$/);
  if (match && match[2] === period) {
    return { propertyId: match[1], period };
  }
  return { period };
}

/** True when JE-MPL for the period already books revenue/expense for this property. */
export function monthlyPlCoversProperty(
  period: string,
  propertyId: string,
): boolean {
  const prefix = `JE-MPL-${period}-`;
  for (const entry of loadJournalEntries().entries) {
    if (!entry.entry_id.startsWith(prefix)) continue;
    if (entry.entry_id.endsWith(`-${propertyId}`)) return true;
    if (entry.lines.some((line) => line.counterparty_id === propertyId)) {
      return true;
    }
  }
  return false;
}

export function shouldSkipInvoiceJournal(input: {
  invoiceId: string;
  propertyId?: string;
  occurredAt: string;
}): { skip: boolean; reason?: string } {
  const scope = resolveInvoicePropertyScope(input);
  if (!scope.propertyId) {
    return { skip: false };
  }
  if (monthlyPlCoversProperty(scope.period, scope.propertyId)) {
    return {
      skip: true,
      reason: `JE-MPL already posted for ${scope.period} / ${scope.propertyId}`,
    };
  }
  return { skip: false };
}

export type InvoiceMplIntegrityIssue = {
  level: "error" | "warning";
  message: string;
};

/** Both JE-INV and JE-MPL for the same property/month — double revenue risk. */
export function invoiceMplDuplicateIssues(): InvoiceMplIntegrityIssue[] {
  const issues: InvoiceMplIntegrityIssue[] = [];
  for (const entry of loadJournalEntries().entries) {
    if (!entry.entry_id.startsWith("JE-INV-")) continue;
    const invoiceId = entry.entry_id.slice("JE-INV-".length);
    const scope = resolveInvoicePropertyScope({
      invoiceId,
      occurredAt: entry.occurred_at,
    });
    if (!scope.propertyId) continue;
    if (monthlyPlCoversProperty(scope.period, scope.propertyId)) {
      issues.push({
        level: "error",
        message: `invoice ${invoiceId}: JE-INV and JE-MPL both book ${scope.propertyId} for ${scope.period}`,
      });
    }
  }
  return issues;
}
