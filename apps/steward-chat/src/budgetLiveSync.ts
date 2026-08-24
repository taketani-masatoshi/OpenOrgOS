/**
 * Cross-view / cross-tab budget freshness.
 * Admin mutations publish; personal wallet + admin panel subscribe and soft-reload.
 *
 * Tests may override via `window.__ORGOS_BUDGET_SYNC__`:
 *   { broadcast: false, pollMs: 1500 } — poll-only regression without BroadcastChannel.
 */

export const BUDGET_SYNC_CHANNEL = "orgos-budget-sync-v1";

export type BudgetSyncFingerprint = {
  revision?: string;
  updated_at?: string | null;
  event_count?: number;
  /** Expense-claims file revision (preferred over claims_sig when present). */
  claims_revision?: string;
  /** Mid-year outlook optimistic token (OLE-###### / 0). */
  outlook_revision?: string;
  /** Stable signature of claim statuses (non-BDE content). */
  claims_sig?: string;
};

export type BudgetSyncMessage = {
  type: "budget-mutated";
  at: number;
  source?: string;
  revision?: string;
  /** Opaque tag — skip reload only when identical to local tag. */
  content_tag?: string;
  force?: boolean;
};

/** How often a visible personal-wallet / admin tab soft-reloads while focused. */
export const WALLET_VISIBLE_POLL_MS = 45_000;

export type BudgetSyncRuntimeOptions = {
  pollMs: number;
  broadcastEnabled: boolean;
};

declare global {
  interface Window {
    __ORGOS_BUDGET_SYNC__?: {
      pollMs?: number;
      broadcast?: boolean;
    };
  }
}

/** Runtime knobs (E2E / diagnostics). Defaults preserve production behavior. */
export function readBudgetSyncRuntimeOptions(): BudgetSyncRuntimeOptions {
  const override =
    typeof window !== "undefined" ? window.__ORGOS_BUDGET_SYNC__ : undefined;
  const pollMs =
    typeof override?.pollMs === "number" &&
    Number.isFinite(override.pollMs) &&
    override.pollMs >= 500
      ? Math.floor(override.pollMs)
      : WALLET_VISIBLE_POLL_MS;
  return {
    pollMs,
    broadcastEnabled: override?.broadcast !== false,
  };
}

export function budgetSyncContentTag(fp: BudgetSyncFingerprint): string {
  return [
    fp.revision ?? "0",
    fp.updated_at ?? "",
    String(fp.event_count ?? 0),
    fp.claims_revision ?? fp.claims_sig ?? "",
    fp.outlook_revision ?? "",
  ].join("|");
}

export function claimsSignature(
  claims: Array<{
    claim_id: string;
    status: string;
    reimbursement?: { status?: string };
  }> | null | undefined,
): string {
  if (!claims?.length) return "";
  return [...claims]
    .map(
      (claim) =>
        `${claim.claim_id}:${claim.status}:${claim.reimbursement?.status ?? ""}`,
    )
    .sort()
    .join(",");
}

export function fingerprintFromBudget(budget: {
  revision?: string;
  updated_at?: string | null;
  event_count?: number;
  claims_revision?: string;
  outlook_reference?: { revision?: string };
  expense_claims?: Array<{
    claim_id: string;
    status: string;
    reimbursement?: { status?: string };
  }>;
}): BudgetSyncFingerprint {
  return {
    revision: budget.revision,
    updated_at: budget.updated_at,
    event_count: budget.event_count,
    claims_revision: budget.claims_revision,
    outlook_revision: budget.outlook_reference?.revision,
    claims_sig: claimsSignature(budget.expense_claims),
  };
}

/**
 * Skip only when the publisher's content tag matches what we already hold.
 * Missing tag / force → always reload (safe default for claim-only updates).
 */
export function shouldSkipBudgetSyncReload(
  message: BudgetSyncMessage,
  current: BudgetSyncFingerprint,
): boolean {
  if (message.force) return false;
  if (!message.content_tag) return false;
  return message.content_tag === budgetSyncContentTag(current);
}

export function publishBudgetMutation(
  source = "admin",
  fingerprint?: BudgetSyncFingerprint & { force?: boolean },
): void {
  if (!readBudgetSyncRuntimeOptions().broadcastEnabled) return;
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(BUDGET_SYNC_CHANNEL);
    const message: BudgetSyncMessage = {
      type: "budget-mutated",
      at: Date.now(),
      source,
      revision: fingerprint?.revision,
      content_tag: fingerprint
        ? budgetSyncContentTag(fingerprint)
        : undefined,
      force: fingerprint?.force,
    };
    channel.postMessage(message);
    channel.close();
  } catch {
    // Ignore environments without BroadcastChannel.
  }
}

export function subscribeBudgetMutations(
  onMutation: (message: BudgetSyncMessage) => void,
): () => void {
  if (!readBudgetSyncRuntimeOptions().broadcastEnabled) return () => {};
  if (typeof BroadcastChannel === "undefined") return () => {};
  try {
    const channel = new BroadcastChannel(BUDGET_SYNC_CHANNEL);
    const handler = (event: MessageEvent<BudgetSyncMessage>) => {
      if (event.data?.type === "budget-mutated") {
        onMutation(event.data);
      }
    };
    channel.addEventListener("message", handler);
    return () => {
      channel.removeEventListener("message", handler);
      channel.close();
    };
  } catch {
    return () => {};
  }
}
