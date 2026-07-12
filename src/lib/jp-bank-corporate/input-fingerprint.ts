import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../utils.js";

const INPUT_FILES = [
  "cash-balance.yaml",
  "payment-calendar.yaml",
  "ar-ap-ledger.yaml",
  "collection-terms.yaml",
  "bank-statements.yaml",
  "reconciliation-events.yaml",
  "chart-of-accounts.yaml",
  "payroll.yaml",
  "fixed-costs.yaml",
  "tax-profile.yaml",
] as const;

/** Hashes only L1-safe file bytes and names; no values are returned or logged. */
export function computeJpBankInputFingerprint(): string {
  const financeDir = join(getDataDir(), "finance");
  const hash = createHash("sha256");
  for (const filename of INPUT_FILES) {
    const path = join(financeDir, filename);
    hash.update(filename);
    hash.update("\0");
    if (existsSync(path)) hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}
