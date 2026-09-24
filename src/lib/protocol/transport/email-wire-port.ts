import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import type { PeerProfile } from "../../../../schemas/protocol/peers.js";

/** Explicit email_wire deliverer — transport must not import adapters/email-wire-deliver. */
export type EmailWireDeliverFn = (
  envelope: EventEnvelope,
  peer: PeerProfile,
  endpointUrl: string
) => Promise<{
  ok: boolean;
  reason: string;
  smtpMessageId?: string;
}>;
