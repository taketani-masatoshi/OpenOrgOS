/**
 * Audit trail for OOO correspondence gate rejections (L1 — no body L2).
 */
import { appendAuditEvent } from "../audit-log.js";

export type CorrespondenceGateId =
  | "recipient"
  | "claims"
  | "amount"
  | "fulfillment"
  | "date"
  | "attachment"
  | "style_lint"
  | "approval"
  | "operator";

export function recordCorrespondenceGateRejection(opts: {
  gate: CorrespondenceGateId;
  channel: string;
  ref: string;
  actor?: string;
  reason: string;
}): void {
  const detail = `${opts.gate}:${opts.channel}:${opts.reason}`.replace(/\s+/g, " ").slice(0, 480);
  appendAuditEvent({
    event: "correspondence_gate",
    ref: opts.ref,
    actor: opts.actor,
    detail,
  });
}

/** Run outbound OOO asserts; log and rethrow on gate failure. */
export function runCorrespondenceOutboundGates(
  draft: {
    draft_id: string;
    channel: string;
    body?: string;
    created_by?: string;
  },
  fn: () => void,
  actor?: string,
): void {
  try {
    fn();
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    let gate: CorrespondenceGateId = "claims";
    if (/style lint|禁句|CorrespondenceStyleLint/i.test(reason)) gate = "style_lint";
    else if (/宛先|external-contacts|recipient/i.test(reason)) gate = "recipient";
    else if (/金額|amount/i.test(reason)) gate = "amount";
    else if (/在庫|納期|inventory|delivery|fulfillment/i.test(reason)) gate = "fulfillment";
    else if (/日付/i.test(reason)) gate = "date";
    else if (/添付|allowlist/i.test(reason)) gate = "attachment";
    recordCorrespondenceGateRejection({
      gate,
      channel: draft.channel,
      ref: draft.draft_id,
      actor: actor ?? draft.created_by,
      reason,
    });
    throw e;
  }
}
