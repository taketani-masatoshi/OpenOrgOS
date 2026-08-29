import { loadJournalEntries } from "../finance/expense-claim-journal.js";
import { resolveLedgerPlan } from "./ledger-plans.js";
import { loadLedgerSubscription } from "./ledger-subscription.js";

export type LedgerUsageSnapshot = {
  plan: string | null;
  journal_limit_per_month: number | null;
  current_month_entries: number;
  limit_exceeded: boolean;
  limit_remaining: number | null;
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function buildLedgerUsageSnapshot(): LedgerUsageSnapshot {
  const sub = loadLedgerSubscription();
  const plan = sub ? resolveLedgerPlan(sub.plan) : null;
  const month = currentMonth();
  const currentMonthEntries = loadJournalEntries().entries.filter((entry) =>
    entry.occurred_at.startsWith(month),
  ).length;
  const limit = plan?.journal_limit_per_month ?? null;
  const limitExceeded = limit != null && currentMonthEntries >= limit;
  const limitRemaining =
    limit == null ? null : Math.max(0, limit - currentMonthEntries);
  return {
    plan: plan?.id ?? null,
    journal_limit_per_month: limit,
    current_month_entries: currentMonthEntries,
    limit_exceeded: limitExceeded,
    limit_remaining: limitRemaining,
  };
}

export function assertLedgerJournalPostAllowed(): void {
  const usage = buildLedgerUsageSnapshot();
  if (!usage.limit_exceeded) return;
  throw new Error(
    `Starter plan journal limit reached (${usage.journal_limit_per_month}/month). Upgrade to Business.`,
  );
}
