/**
 * Bank and prior-evidence gates for monthly close.
 */
import { createHash } from "node:crypto";
import { lastDayOfMonth } from "./fiscal-year.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { latestLockForMonth } from "./period-lock.js";
import {
  bankRowsForMonth,
  isFirstFiscalMonth,
  monthBankTieOut,
  previousMonth,
  tenantUsesBank,
  unmatchedBankCountForMonth,
} from "./monthly-close-bank.js";
import type { MonthlyCloseGate, MonthlyCloseGateLevel } from "./monthly-close-gates.js";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function gate(
  id: string,
  label: string,
  pass: boolean,
  level: MonthlyCloseGateLevel,
  detail?: string,
): MonthlyCloseGate {
  return { id, label, pass, level, ...(detail ? { detail } : {}) };
}

export function bankEvidenceSnapshot(
  month: string,
  operatorId: string,
): {
  state: number | "missing" | "unreadable";
  unmatched: number | null;
  gl_delta: number | null;
  bank_net: number | null;
  operator_id: string;
} {
  const rows = bankRowsForMonth(month);
  const tie = monthBankTieOut(month);
  return {
    state: rows,
    unmatched:
      typeof rows === "number" && rows > 0
        ? unmatchedBankCountForMonth(month)
        : null,
    gl_delta: tie.glDelta,
    bank_net: tie.bankNet,
    operator_id: operatorId,
  };
}

export function pushBankGates(items: MonthlyCloseGate[], month: string): void {
  const rows = bankRowsForMonth(month);
  if (!tenantUsesBank()) {
    items.push(
      gate("bank-imported", "銀行明細を取込済み", true, "skip", "no bank"),
    );
    items.push(
      gate("bank-unmatched", "銀行明細の未消込なし", true, "skip", "no bank"),
    );
    items.push(
      gate("bank-gl-tieout", "銀行残高と総勘定が一致", true, "skip", "no bank"),
    );
    return;
  }
  if (rows === "missing" || rows === "unreadable" || rows === 0) {
    const detail =
      rows === "missing"
        ? "no bank file"
        : rows === "unreadable"
          ? "bank statements unreadable"
          : "no bank rows for month";
    items.push(
      gate("bank-imported", "銀行明細を取込済み", false, "error", detail),
    );
    items.push(
      gate("bank-unmatched", "銀行明細の未消込なし", false, "error", detail),
    );
    items.push(
      gate("bank-gl-tieout", "銀行残高と総勘定が一致", false, "error", detail),
    );
    return;
  }
  items.push(gate("bank-imported", "銀行明細を取込済み", true, "error", "ok"));
  const unmatched = unmatchedBankCountForMonth(month) ?? 0;
  items.push(
    gate(
      "bank-unmatched",
      "銀行明細の未消込なし",
      unmatched === 0,
      "error",
      unmatched === 0 ? "ok" : `${unmatched} unmatched`,
    ),
  );
  const tie = monthBankTieOut(month);
  items.push(
    gate("bank-gl-tieout", "銀行残高と総勘定が一致", tie.pass, "error", tie.detail),
  );
}

export function priorEvidenceGate(month: string): MonthlyCloseGate {
  if (isFirstFiscalMonth(month)) {
    return gate(
      "prior-evidence",
      "直前月の銀行と試算表",
      true,
      "skip",
      "first fiscal month",
    );
  }
  const previous = previousMonth(month);
  const latest = latestLockForMonth(previous);
  if (latest?.status !== "locked" || !latest.evidence?.operator_id) {
    return gate(
      "prior-evidence",
      "直前月の銀行と試算表",
      true,
      "skip",
      "no prior close evidence",
    );
  }
  const bankHash = sha256(
    bankEvidenceSnapshot(previous, latest.evidence.operator_id),
  );
  const trialHash = sha256(buildTrialBalance({ asOf: lastDayOfMonth(previous) }));
  const bankOk = bankHash === latest.evidence.bank_reconciliation_sha256;
  const trialOk = trialHash === latest.evidence.trial_balance_sha256;
  if (!bankOk || !trialOk) {
    return gate(
      "prior-evidence",
      "直前月の銀行と試算表",
      false,
      "error",
      "prior bank or trial balance changed",
    );
  }
  return gate("prior-evidence", "直前月の銀行と試算表", true, "error", "ok");
}
