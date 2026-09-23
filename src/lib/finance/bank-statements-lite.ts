import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDataDir, readYamlFile } from "../utils.js";
import { assertReconciliationReadable } from "./reconciliation-transaction.js";
import {
  arApLedgerFileSchema,
  bankStatementFileSchema,
} from "../../../schemas/jp-bank-corporate.js";
import { replayReconciliation } from "../jp-bank-corporate/reconciliation.js";
import {
  loadReconciliationEventFile,
  reconciliationEventPath,
} from "../jp-bank-corporate/reconciliation-store.js";

const bankStatementFileLiteSchema = z.object({
  as_of: z.string().optional(),
  entries: z
    .array(
      z.object({
        id: z.string(),
        date: z.string(),
        direction: z.enum(["inflow", "outflow"]),
        amount: z.number(),
        status: z.string().optional(),
        unapplied_amount: z.number().optional(),
      })
    )
    .default([]),
});

export type BankStatementLite = z.output<typeof bankStatementFileLiteSchema>;

/** Lightweight read of finance/bank-statements.yaml (optional). */
export function loadBankStatementsLite(asOf?: string): BankStatementLite | null {
  assertReconciliationReadable();
  const path = join(getDataDir(), "finance/bank-statements.yaml");
  if (!existsSync(path)) return null;
  try {
    const snapshot = readYamlFile(path, bankStatementFileLiteSchema);
    // Legacy rows remain compatible until that row has event history.
    if (!existsSync(reconciliationEventPath())) return snapshot;
    const bank = readYamlFile(path, bankStatementFileSchema);
    const arApPath = join(getDataDir(), "finance/ar-ap-ledger.yaml");
    const arAp = existsSync(arApPath) ? readYamlFile(arApPath, arApLedgerFileSchema).entries : [];
    const state = replayReconciliation(
      arAp,
      bank.entries,
      loadReconciliationEventFile().events,
      asOf
    );
    // Corrupt events must not silently fall back to a stale matched snapshot.
    if (state.errors.length > 0) return null;
    return {
      ...snapshot,
      entries: snapshot.entries.map((row) => {
        const derived = state.bank_statements.get(row.id)!;
        return {
          ...row,
          status: derived.status,
          unapplied_amount:
            derived.legacy_snapshot && derived.status === "partial"
              ? row.unapplied_amount
              : derived.unapplied_amount,
        };
      }),
    };
  } catch {
    return null;
  }
}

/** Net cash movement from bank statements in (fromExclusive, toInclusive]. */
export function bankStatementNetMovement(
  file: BankStatementLite,
  fromExclusive: string,
  toInclusive: string
): number {
  let net = 0;
  for (const entry of file.entries) {
    if (entry.status === "voided") continue;
    if (entry.date <= fromExclusive || entry.date > toInclusive) continue;
    net += entry.direction === "inflow" ? entry.amount : -entry.amount;
  }
  return net;
}
