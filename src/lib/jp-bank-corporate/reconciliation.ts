import { createHash } from "node:crypto";
import type {
  ArApEntry,
  BankStatementEntry,
  ReconciliationAllocation,
  ReconciliationEvent,
} from "../../../schemas/jp-bank-corporate.js";

export interface DerivedArApState {
  entry: ArApEntry;
  allocated_amount: number;
  settled_amount: number;
  remaining_amount: number;
  status: ArApEntry["status"];
  collected_or_paid_date?: string;
}

export interface DerivedBankStatementState {
  entry: BankStatementEntry;
  allocated_amount: number;
  unapplied_amount: number;
  status: "unmatched" | "partial" | "matched" | "voided";
}

export interface ReconciliationState {
  ar_ap: Map<string, DerivedArApState>;
  bank_statements: Map<string, DerivedBankStatementState>;
  active_allocations: Array<
    ReconciliationAllocation & { event_id: string; effective_date: string }
  >;
  errors: string[];
}

export interface MatchProposal {
  id: string;
  bank_statement_id: string;
  ar_ap_id: string;
  amount: number;
  confidence: "exact" | "candidate";
  reasons: string[];
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compatibleDirection(bank: BankStatementEntry, arAp: ArApEntry): boolean {
  return (
    (bank.direction === "inflow" && arAp.kind === "ar") ||
    (bank.direction === "outflow" && arAp.kind === "ap")
  );
}

function derivedArApStatus(
  entry: ArApEntry,
  settled: number
): ArApEntry["status"] {
  if (entry.status === "cancelled") return "cancelled";
  if (settled <= 0) return "open";
  if (settled < entry.amount) return "partial";
  return entry.kind === "ar" ? "collected" : "paid";
}

/**
 * Replays reconciliation events without I/O. Events are processed in stored
 * order; correction is represented by a later reversal event.
 */
export function replayReconciliation(
  arApEntries: ArApEntry[],
  bankEntries: BankStatementEntry[],
  events: ReconciliationEvent[],
  asOf?: string
): ReconciliationState {
  const errors: string[] = [];
  const eventIds = new Set<string>();
  const applied = new Map<
    string,
    Extract<ReconciliationEvent, { type: "reconciliation.applied" }>
  >();
  const reversed = new Set<string>();
  const voidedBank = new Set<string>();

  for (const event of events) {
    if (eventIds.has(event.id)) {
      errors.push(`duplicate reconciliation event id ${event.id}`);
      continue;
    }
    eventIds.add(event.id);
    if (asOf && event.effective_date > asOf) continue;
    if (event.type === "reconciliation.applied") {
      applied.set(event.id, event);
    } else if (event.type === "reconciliation.reversed") {
      if (!applied.has(event.target_event_id)) {
        errors.push(
          `${event.id}: reversal target ${event.target_event_id} is missing or not earlier`
        );
      } else if (reversed.has(event.target_event_id)) {
        errors.push(`${event.id}: reconciliation ${event.target_event_id} already reversed`);
      } else {
        reversed.add(event.target_event_id);
      }
    } else {
      voidedBank.add(event.bank_statement_id);
    }
  }

  const arApById = new Map(arApEntries.map((entry) => [entry.id, entry]));
  const bankById = new Map(bankEntries.map((entry) => [entry.id, entry]));
  const allocatedByArAp = new Map<string, number>();
  const allocatedByBank = new Map<string, number>();
  const lastDateByArAp = new Map<string, string>();
  const activeAllocations: ReconciliationState["active_allocations"] = [];

  for (const [eventId, event] of applied) {
    if (reversed.has(eventId)) continue;
    for (const allocation of event.allocations) {
      const arAp = arApById.get(allocation.ar_ap_id);
      const bank = bankById.get(allocation.bank_statement_id);
      if (!arAp) {
        errors.push(`${eventId}: AR/AP ${allocation.ar_ap_id} not found`);
        continue;
      }
      if (!bank) {
        errors.push(`${eventId}: bank statement ${allocation.bank_statement_id} not found`);
        continue;
      }
      if (voidedBank.has(bank.id)) {
        errors.push(`${eventId}: bank statement ${bank.id} is voided`);
        continue;
      }
      if (!compatibleDirection(bank, arAp)) {
        errors.push(`${eventId}: direction does not match ${bank.id} -> ${arAp.id}`);
        continue;
      }
      if (
        bank.account_id &&
        arAp.account_id &&
        bank.account_id !== arAp.account_id
      ) {
        errors.push(`${eventId}: account does not match ${bank.id} -> ${arAp.id}`);
        continue;
      }

      const nextArAp = (allocatedByArAp.get(arAp.id) ?? 0) + allocation.amount;
      const baseline = arAp.paid_amount ?? 0;
      if (baseline + nextArAp > arAp.amount) {
        errors.push(`${eventId}: allocation exceeds remaining amount for ${arAp.id}`);
        continue;
      }
      const nextBank = (allocatedByBank.get(bank.id) ?? 0) + allocation.amount;
      if (nextBank > bank.amount) {
        errors.push(`${eventId}: allocation exceeds bank amount for ${bank.id}`);
        continue;
      }

      allocatedByArAp.set(arAp.id, nextArAp);
      allocatedByBank.set(bank.id, nextBank);
      const previousDate = lastDateByArAp.get(arAp.id);
      if (!previousDate || event.effective_date > previousDate) {
        lastDateByArAp.set(arAp.id, event.effective_date);
      }
      activeAllocations.push({
        ...allocation,
        event_id: eventId,
        effective_date: event.effective_date,
      });
    }
  }

  const ar_ap = new Map<string, DerivedArApState>();
  for (const entry of arApEntries) {
    const allocated = allocatedByArAp.get(entry.id) ?? 0;
    const settled = Math.min(entry.amount, (entry.paid_amount ?? 0) + allocated);
    ar_ap.set(entry.id, {
      entry,
      allocated_amount: allocated,
      settled_amount: settled,
      remaining_amount: Math.max(0, entry.amount - settled),
      status: derivedArApStatus(entry, settled),
      collected_or_paid_date:
        lastDateByArAp.get(entry.id) ?? entry.collected_or_paid_date,
    });
  }

  const bank_statements = new Map<string, DerivedBankStatementState>();
  for (const entry of bankEntries) {
    const allocated = allocatedByBank.get(entry.id) ?? 0;
    const unapplied = Math.max(0, entry.amount - allocated);
    bank_statements.set(entry.id, {
      entry,
      allocated_amount: allocated,
      unapplied_amount: unapplied,
      status: voidedBank.has(entry.id)
        ? "voided"
        : allocated === 0
          ? "unmatched"
          : unapplied === 0
            ? "matched"
            : "partial",
    });
  }

  return { ar_ap, bank_statements, active_allocations: activeAllocations, errors };
}

function referencesEntry(bank: BankStatementEntry, entry: ArApEntry): boolean {
  const reference = bank.reference?.trim();
  return Boolean(reference && (reference === entry.id || reference === entry.invoice_id));
}

/** Exact reference matches are safe to auto-apply, including partial payments. */
export function proposeReconciliationMatches(
  arApEntries: ArApEntry[],
  bankEntries: BankStatementEntry[],
  events: ReconciliationEvent[],
  asOf?: string,
  baselineAsOf?: string
): MatchProposal[] {
  const state = replayReconciliation(arApEntries, bankEntries, events, asOf);
  const proposals: MatchProposal[] = [];

  for (const bankState of [...state.bank_statements.values()].sort((a, b) =>
    a.entry.id.localeCompare(b.entry.id)
  )) {
    if (baselineAsOf && bankState.entry.date <= baselineAsOf) continue;
    if (bankState.status === "voided" || bankState.unapplied_amount <= 0) continue;
    const exact = [...state.ar_ap.values()].filter(
      (candidate) =>
        candidate.remaining_amount > 0 &&
        compatibleDirection(bankState.entry, candidate.entry) &&
        (!candidate.entry.account_id ||
          candidate.entry.account_id === bankState.entry.account_id) &&
        referencesEntry(bankState.entry, candidate.entry)
    );
    if (exact.length === 1) {
      const target = exact[0]!;
      const amount = Math.min(bankState.unapplied_amount, target.remaining_amount);
      proposals.push({
        id: `MATCH-${digest(`${bankState.entry.id}|${target.entry.id}|${amount}`).slice(0, 16)}`,
        bank_statement_id: bankState.entry.id,
        ar_ap_id: target.entry.id,
        amount,
        confidence: "exact",
        reasons: ["unique-reference", "direction", "account", "amount-within-balance"],
      });
      continue;
    }

    const candidates = [...state.ar_ap.values()].filter(
      (candidate) =>
        candidate.remaining_amount > 0 &&
        compatibleDirection(bankState.entry, candidate.entry) &&
        candidate.remaining_amount === bankState.unapplied_amount
    );
    for (const candidate of candidates) {
      proposals.push({
        id: `MATCH-${digest(`${bankState.entry.id}|${candidate.entry.id}|candidate`).slice(0, 16)}`,
        bank_statement_id: bankState.entry.id,
        ar_ap_id: candidate.entry.id,
        amount: bankState.unapplied_amount,
        confidence: "candidate",
        reasons: ["amount", "direction", "approval-required"],
      });
    }
  }
  return proposals;
}

export function buildReconciliationAppliedEvent(input: {
  id: string;
  occurredAt: string;
  effectiveDate: string;
  actorId: string;
  matchMode: "exact_auto" | "approved";
  proposal: MatchProposal;
}): Extract<ReconciliationEvent, { type: "reconciliation.applied" }> {
  return {
    id: input.id,
    type: "reconciliation.applied",
    occurred_at: input.occurredAt,
    effective_date: input.effectiveDate,
    actor_id: input.actorId,
    match_mode: input.matchMode,
    rule_id:
      input.matchMode === "exact_auto" ? "exact-reference-v1" : undefined,
    proposal_id: input.proposal.id,
    allocations: [
      {
        bank_statement_id: input.proposal.bank_statement_id,
        ar_ap_id: input.proposal.ar_ap_id,
        amount: input.proposal.amount,
      },
    ],
  };
}
