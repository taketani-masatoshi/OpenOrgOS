/**
 * Issuer-side inbound Wire claim (`steward.receipt.claim.requested`).
 * Path: src/lib/receipt-qr/wire-inbound.ts
 *
 * Only a signed envelope from a registered peer OOO is accepted, and the
 * payload must stay amount-free (ADR 0032).
 */
import {
  eventEnvelopeSchema,
  type EventEnvelope,
} from "../../../schemas/protocol/org-event.js";
import {
  findPeerByOrgRef,
  verifyInboundProtocolEnvelope,
} from "../protocol/inbound-verify.js";
import { claimReceipt } from "./claim.js";

const RECEIPT_CLAIM_AMOUNT_LEAK_KEYS = [
  "amount",
  "total_amount",
  "lines",
  "tax_totals",
  "amount_including_tax",
  "amount_excluding_tax",
] as const;

type ReceiptClaimApiResponse = {
  status: number;
  body: Record<string, unknown>;
};

/** ADR 0032 — inbound Wire claim must reject amount/line fields defensively. */
export function forbiddenAmountFieldInReceiptClaimPayload(
  payload: Record<string, unknown>,
): string | null {
  for (const key of RECEIPT_CLAIM_AMOUNT_LEAK_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return key;
  }
  return null;
}

/** Authenticated peer envelope, or the HTTP rejection to send back. */
function authenticateClaimEnvelope(
  raw: string,
): { ok: true; envelope: EventEnvelope; peerId: string } | { ok: false; response: ReceiptClaimApiResponse } {
  let envelope: EventEnvelope;
  try {
    envelope = eventEnvelopeSchema.parse(JSON.parse(raw));
  } catch {
    return { ok: false, response: { status: 400, body: { ok: false, error: "invalid_envelope" } } };
  }
  if (envelope.event.type !== "steward.receipt.claim.requested") {
    return {
      ok: false,
      response: { status: 422, body: { ok: false, error: "unexpected_event_type" } },
    };
  }
  const peer = findPeerByOrgRef(envelope.origin);
  if (!peer?.protocol_public_key || !envelope.signature) {
    return {
      ok: false,
      response: { status: 401, body: { ok: false, error: "authenticated_ooo_required" } },
    };
  }
  const verified = verifyInboundProtocolEnvelope(envelope);
  if (!verified.ok) {
    return {
      ok: false,
      response: { status: 401, body: { ok: false, error: verified.issues.join("; ") } },
    };
  }
  return { ok: true, envelope, peerId: peer.peer_id };
}

export function handleReceiptClaimApi(raw: string): ReceiptClaimApiResponse {
  const auth = authenticateClaimEnvelope(raw);
  if (!auth.ok) return auth.response;
  const { envelope, peerId } = auth;
  const leak = forbiddenAmountFieldInReceiptClaimPayload(
    envelope.event.payload as Record<string, unknown>,
  );
  if (leak) {
    return {
      status: 422,
      body: {
        ok: false,
        error: "amount_fields_forbidden",
        detail: `Wire receipt claim must not include ${leak} (ADR 0032)`,
      },
    };
  }
  const receiptId = envelope.event.payload.receipt_id;
  const claimKey = envelope.event.payload.claim_key;
  const receiptDigest = envelope.event.payload.receipt_digest;
  if (
    typeof receiptId !== "string" ||
    typeof claimKey !== "string" ||
    typeof receiptDigest !== "string"
  ) {
    return {
      status: 422,
      body: {
        ok: false,
        error: "receipt_id, receipt_digest and claim_key required",
      },
    };
  }
  try {
    const result = claimReceipt({
      receiptId,
      claimKey,
      claimantPeerId: peerId,
      claimantOrgId: envelope.origin.org_id,
      proposedBy: `wire:${envelope.origin.org_id}`,
      requestEventId: envelope.event_id,
      receiptDigest,
    });
    return {
      status: result.idempotent ? 200 : 202,
      body: {
        ok: true,
        receipt_id: receiptId,
        status: result.receipt.claim_status,
        approval_id: result.approvalId,
        idempotent: result.idempotent,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const conflict = message.includes("already been consumed");
    return {
      status: conflict ? 409 : 400,
      body: { ok: false, error: message },
    };
  }
}
