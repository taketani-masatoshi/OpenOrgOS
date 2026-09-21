import { existsSync } from "node:fs";
import { join } from "node:path";
import { findExpenseClaim, loadExpenseClaims } from "../finance/expense-claim.js";
import { getDataDir } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

const CLAIMS_REL = "data/finance/expense-claims.yaml";

/** Resolve a claim id against expense-claims.yaml. Ids and status only — no receipt body. */
export function resolveExpenseClaimRef(referenceId: string): {
  found: boolean;
  claimId?: string;
  status?: string;
  amountYen?: number;
  inputs_ref: string[];
  missing_refs: string[];
} {
  const path = join(getDataDir(), "finance", "expense-claims.yaml");
  if (!existsSync(path)) {
    return {
      found: false,
      inputs_ref: [],
      missing_refs: ["finance/expense-claims.yaml"],
    };
  }
  try {
    loadExpenseClaims();
  } catch {
    return {
      found: false,
      inputs_ref: [],
      missing_refs: ["finance/expense-claims.yaml"],
    };
  }
  const claim = findExpenseClaim(referenceId);
  if (!claim) {
    return {
      found: false,
      inputs_ref: [CLAIMS_REL],
      missing_refs: [`claim:${referenceId}`],
    };
  }
  return {
    found: true,
    claimId: claim.claim_id,
    status: claim.status,
    amountYen: claim.amount_yen,
    inputs_ref: [CLAIMS_REL],
    missing_refs: [],
  };
}

/** Reference id only. Photo bytes are refused. Approval stays human. */
export function proposeExpenseIntake(input: {
  channel: "line" | "slack" | "mail" | "chat";
  referenceId: string;
  amountYen?: number;
  photo?: unknown;
}): {
  channel: string;
  referenceId: string;
  apply: "human";
  claim: {
    referenceId: string;
    claimId?: string;
    amountYen?: number;
    status: "proposal";
  };
} {
  if (input.photo != null) throw new Error("photo bytes are refused");
  if (!/^[A-Za-z0-9-]{3,64}$/.test(input.referenceId)) {
    throw new Error("referenceId must be an id, not a document body");
  }
  const claimId = /^ECL-\d{8}-\d{3}$/.test(input.referenceId) ? input.referenceId : undefined;
  return {
    channel: input.channel,
    referenceId: input.referenceId,
    apply: "human",
    claim: {
      referenceId: input.referenceId,
      claimId,
      amountYen: input.amountYen,
      status: "proposal",
    },
  };
}

/** One report. Reference id + optional claims ledger lookup — no photo, no auto-approve. */
export function renderExpenseIntakeReport(input: {
  channel: "line" | "slack" | "mail" | "chat";
  referenceId: string;
  amountYen?: number;
  photo?: unknown;
}): Record<string, unknown> {
  const proposed = proposeExpenseIntake(input);
  const resolved =
    proposed.claim.claimId != null
      ? resolveExpenseClaimRef(proposed.claim.claimId)
      : { found: false, inputs_ref: [] as string[], missing_refs: [] as string[] };
  return flattenProposeReport(
    makeProposeReport({
      kind: "expense-intake-report",
      depth: resolved.inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref: resolved.inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        ...proposed,
        claim: {
          ...proposed.claim,
          amountYen: proposed.claim.amountYen ?? resolved.amountYen,
          ledgerStatus: resolved.status ?? null,
          foundInLedger: resolved.found,
        },
        missing_refs: resolved.missing_refs,
        photo: null,
        autoApprove: false,
      },
    }),
  );
}
