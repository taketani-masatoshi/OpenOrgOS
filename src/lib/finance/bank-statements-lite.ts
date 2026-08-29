import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDataDir, readYamlFile } from "../utils.js";

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
      }),
    )
    .default([]),
});

export type BankStatementLite = z.output<typeof bankStatementFileLiteSchema>;

/** Lightweight read of finance/bank-statements.yaml (optional). */
export function loadBankStatementsLite(): BankStatementLite | null {
  const path = join(getDataDir(), "finance/bank-statements.yaml");
  if (!existsSync(path)) return null;
  try {
    return readYamlFile(path, bankStatementFileLiteSchema);
  } catch {
    return null;
  }
}

/** Net cash movement from bank statements in (fromExclusive, toInclusive]. */
export function bankStatementNetMovement(
  file: BankStatementLite,
  fromExclusive: string,
  toInclusive: string,
): number {
  let net = 0;
  for (const entry of file.entries) {
    if (entry.status === "voided") continue;
    if (entry.date <= fromExclusive || entry.date > toInclusive) continue;
    net += entry.direction === "inflow" ? entry.amount : -entry.amount;
  }
  return net;
}
