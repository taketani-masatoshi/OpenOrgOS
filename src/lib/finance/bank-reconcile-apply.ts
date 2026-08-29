/**
 * Apply approved bank↔AR/AP reconciliation and post GL (HTTP / CLI shared path).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  arApLedgerFileSchema,
  bankStatementFileSchema,
} from "../../../schemas/jp-bank-corporate.js";
import {
  buildReconciliationAppliedEvent,
  proposeReconciliationMatches,
  replayReconciliation,
} from "../jp-bank-corporate/reconciliation.js";
import {
  appendReconciliationEvents,
  loadReconciliationEventFile,
} from "../jp-bank-corporate/reconciliation-store.js";
import { currentDate, getDataDir, readYamlFile } from "../utils.js";
import {
  postBankReconciliationGl,
  resolveReconciliationSettleKind,
} from "./bank-reconciliation-gl.js";
import { loadBankStatementsLite } from "./bank-statements-lite.js";

function eventId(seed: string): string {
  return `rec-${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

function loadBankFile() {
  const path = join(getDataDir(), "finance/bank-statements.yaml");
  if (!existsSync(path)) return null;
  return readYamlFile(path, bankStatementFileSchema);
}

function loadArApFile() {
  const path = join(getDataDir(), "finance/ar-ap-ledger.yaml");
  if (!existsSync(path)) return null;
  return readYamlFile(path, arApLedgerFileSchema);
}

export function listBankReconciliationWorkbench(asOf?: string): {
  unmatched_count: number;
  unmatched: Array<{
    id: string;
    date: string;
    direction: string;
    amount: number;
  }>;
  proposals: Array<{
    bank_statement_id: string;
    ar_ap_id: string;
    amount: number;
    confidence: string;
  }>;
} {
  const lite = loadBankStatementsLite();
  const unmatched =
    lite?.entries
      .filter(
        (row) =>
          (!row.status || row.status === "unmatched") &&
          (!asOf || row.date <= asOf),
      )
      .map((row) => ({
        id: row.id,
        date: row.date,
        direction: row.direction,
        amount: row.amount,
      })) ?? [];

  let proposals: Array<{
    bank_statement_id: string;
    ar_ap_id: string;
    amount: number;
    confidence: string;
  }> = [];
  try {
    const bank = loadBankFile();
    const arAp = loadArApFile();
    if (bank && arAp) {
      const events = loadReconciliationEventFile();
      proposals = proposeReconciliationMatches(
        arAp.entries,
        bank.entries,
        events.events,
        currentDate(),
        arAp.as_of,
      )
        .slice(0, 12)
        .map((p) => ({
          bank_statement_id: p.bank_statement_id,
          ar_ap_id: p.ar_ap_id,
          amount: p.amount,
          confidence: p.confidence,
        }));
    }
  } catch {
    proposals = [];
  }

  return {
    unmatched_count: unmatched.length,
    unmatched: unmatched.slice(0, 20),
    proposals,
  };
}

export function applyApprovedBankReconciliation(input: {
  bankId: string;
  arApId: string;
  amount: number;
  reason: string;
  authorizedBy: string;
  effectiveDate?: string;
}): { event_id: string; entry_id: string } {
  const bankFile = loadBankFile();
  const arFile = loadArApFile();
  if (!bankFile || !arFile) {
    throw new Error("bank-statements or ar-ap-ledger missing");
  }
  const events = loadReconciliationEventFile();
  const proposal = {
    id: eventId(`approved|${input.bankId}|${input.arApId}|${input.amount}`),
    bank_statement_id: input.bankId,
    ar_ap_id: input.arApId,
    amount: input.amount,
    confidence: "candidate" as const,
    reasons: ["human-approved"],
  };
  const event = buildReconciliationAppliedEvent({
    id: eventId(`apply|${proposal.id}|${events.events.length}`),
    occurredAt: new Date().toISOString(),
    effectiveDate: input.effectiveDate ?? currentDate(),
    actorId: input.authorizedBy,
    matchMode: "approved",
    proposal,
  });
  event.reason = input.reason;
  const checked = replayReconciliation(arFile.entries, bankFile.entries, [
    ...events.events,
    event,
  ]);
  if (checked.errors.length > 0) {
    throw new Error(checked.errors.join("; "));
  }
  appendReconciliationEvents([event]);
  const bank = bankFile.entries.find((e) => e.id === input.bankId);
  const arAp = arFile.entries.find((e) => e.id === input.arApId);
  const kind = resolveReconciliationSettleKind({
    bankDirection: bank?.direction,
    arApKind: arAp?.kind,
  });
  const entryId = postBankReconciliationGl({
    eventId: event.id,
    kind,
    amountYen: input.amount,
    counterpartyId: arAp?.counterparty || input.arApId,
    occurredAt: event.occurred_at,
    authorizedBy: input.authorizedBy,
  });
  return { event_id: event.id, entry_id: entryId };
}

/** Apply all exact-confidence proposals (bulk dunning-style approve). */
export function applyExactBankReconciliations(input: {
  authorizedBy: string;
  reason?: string;
}): { applied: number; results: Array<{ event_id: string; entry_id: string }> } {
  const workbench = listBankReconciliationWorkbench();
  const exact = workbench.proposals.filter((row) => row.confidence === "exact");
  const results: Array<{ event_id: string; entry_id: string }> = [];
  for (const row of exact) {
    results.push(
      applyApprovedBankReconciliation({
        bankId: row.bank_statement_id,
        arApId: row.ar_ap_id,
        amount: row.amount,
        reason: input.reason ?? "bulk-exact-approve",
        authorizedBy: input.authorizedBy,
      }),
    );
  }
  return { applied: results.length, results };
}
