import { writeBudgetDigest } from "./budget/budget-digest.js";
import { writeContractsDigest } from "./contracts/contracts-digest.js";
import { writeLedgerDigest } from "./ledger/ledger-digest.js";
import { writeOrgDigest } from "./org/org-digest.js";
import { writeSalesDigest } from "./sales/sales-digest.js";
import { writeTaxDigest } from "./tax/tax-digest.js";

type DigestPeriod = "weekly" | "monthly";

const SCOPE_A_WRITERS: Array<{
  surface: string;
  write: (period: DigestPeriod) => void;
}> = [
  { surface: "tax", write: (period) => { writeTaxDigest({ period }); } },
  { surface: "contracts", write: (period) => { writeContractsDigest({ period }); } },
  { surface: "sales", write: (period) => { writeSalesDigest({ period }); } },
  { surface: "ledger", write: (period) => { writeLedgerDigest({ period }); } },
  { surface: "budget", write: (period) => { writeBudgetDigest({ period }); } },
  { surface: "org", write: (period) => { writeOrgDigest({ period }); } },
];

/**
 * Write Scope A static digests (tax/contracts/sales/ledger/budget/org) for weekly|monthly.
 * Per-surface errors are collected; one failure does not skip the others.
 */
export function runScopeAStaticDigests(period: DigestPeriod): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  for (const { surface, write } of SCOPE_A_WRITERS) {
    try {
      write(period);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`${surface}: ${message}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
