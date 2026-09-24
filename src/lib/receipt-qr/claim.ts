/**
 * Issuer-side receipt claim: claimant OOO proposes, a human approves or rejects.
 * Path: src/lib/receipt-qr/claim.ts
 *
 * A claim key is single-use per claimant OOO; repeat claims from the same OOO
 * are idempotent. Approval / rejection go through the inter-org notice workflow.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import { storedReceiptSchema, type StoredReceipt } from "../../../schemas/receipt-qr.js";
import { findPeer } from "../protocol/peers.js";
import {
  approveInterOrgNotice,
  bridgeProposeReceiptClaimed,
  rejectInterOrgNotice,
} from "../wire/notice-workflow.js";
import {
  findStoredReceipt,
  patchStoredReceipt,
  requireReceiptIndex,
  withRegistryLock,
} from "./registry.js";
import { sha256Hex } from "./signature.js";

function keyMatches(expectedHash: string, candidate: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(sha256Hex(candidate), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function claimReceipt(options: {
  receiptId: string;
  claimKey: string;
  claimantPeerId: string;
  claimantOrgId: string;
  proposedBy: string;
  requestEventId?: string;
  receiptDigest?: string;
}): { receipt: StoredReceipt; approvalId: string; idempotent: boolean } {
  const peer = findPeer(options.claimantPeerId);
  if (!peer) throw new Error(`Peer ${options.claimantPeerId} not registered`);
  return withRegistryLock((registry) => {
    const index = requireReceiptIndex(registry, options.receiptId);
    const row = registry.receipts[index]!;
    if (options.receiptDigest && options.receiptDigest !== row.digest) {
      throw new Error("Receipt digest mismatch");
    }
    if (!keyMatches(row.claim_key_hash, options.claimKey)) {
      throw new Error("Invalid receipt claim key");
    }
    if (row.claim_status !== "unclaimed") {
      if (
        row.claimed_by_org_id === options.claimantOrgId &&
        row.claim_approval_id
      ) {
        return {
          receipt: row,
          approvalId: row.claim_approval_id,
          idempotent: true,
        };
      }
      throw new Error(
        "Receipt claim key has already been consumed by another OOO",
      );
    }
    const requestEventId = options.requestEventId ?? randomUUID();
    const approval = bridgeProposeReceiptClaimed({
      peerId: options.claimantPeerId,
      receiptId: options.receiptId,
      receiptDigest: row.digest,
      proposedBy: options.proposedBy,
      correlationEventId: requestEventId,
      message: `領収書 ${options.receiptId} claim · digest ${row.digest}`,
    });
    const updated = storedReceiptSchema.parse({
      ...row,
      claim_status: "claim_pending_approval",
      claimed_by_org_id: options.claimantOrgId,
      claimed_by_peer_id: options.claimantPeerId,
      claim_requested_at: new Date().toISOString(),
      claim_approval_id: approval.notice_id,
    });
    registry.receipts[index] = updated;
    return {
      receipt: updated,
      approvalId: approval.notice_id,
      idempotent: false,
    };
  });
}

/** Returns the notice id of a claim that is waiting for a human decision. */
function requirePendingClaimApprovalId(receiptId: string): string {
  const row = findStoredReceipt(receiptId);
  if (!row?.claim_approval_id)
    throw new Error("Receipt has no pending claim approval");
  if (row.claim_status !== "claim_pending_approval") {
    throw new Error(
      `Receipt claim is not pending approval (status=${row.claim_status})`,
    );
  }
  return row.claim_approval_id;
}

export function approveReceiptClaim(options: {
  receiptId: string;
  approverId: string;
  operatorId?: string;
}): StoredReceipt {
  const approved = approveInterOrgNotice({
    noticeId: requirePendingClaimApprovalId(options.receiptId),
    approverId: options.approverId,
    operatorId: options.operatorId,
  });
  return patchStoredReceipt(options.receiptId, {
    claim_status: "claimed",
    claimed_event_id: approved.transmission.envelope.event_id,
    claimed_at: new Date().toISOString(),
  });
}

export function rejectReceiptClaim(options: {
  receiptId: string;
  approverId: string;
  reason: string;
}): StoredReceipt {
  const reason = options.reason.trim();
  if (!reason) throw new Error("Reject reason is required");
  rejectInterOrgNotice({
    noticeId: requirePendingClaimApprovalId(options.receiptId),
    approverId: options.approverId,
    reason,
  });
  return patchStoredReceipt(options.receiptId, {
    claim_status: "claim_rejected",
    claim_rejected_at: new Date().toISOString(),
    claim_reject_reason: reason,
    claim_rejected_by: options.approverId,
  });
}
