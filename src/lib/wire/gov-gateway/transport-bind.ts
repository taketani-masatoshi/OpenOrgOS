import type { DeliverProtocolEnvelopeOptions } from "../../protocol/transport/transport.js";
import { deliverEnvelopeViaEmailWire } from "../../protocol/adapters/email-wire-deliver.js";
import { deliverEnvelopeViaGovGateway } from "./deliver.js";

/**
 * Bind optional deliver adapters (gov-gateway · email_wire) for protocol transport calls.
 * Keeps transport free of upward imports into adapters / wire.
 */
export function withGovGatewayDeliver(
  opts?: DeliverProtocolEnvelopeOptions
): DeliverProtocolEnvelopeOptions {
  return {
    ...opts,
    deliverGovGateway: opts?.deliverGovGateway ?? deliverEnvelopeViaGovGateway,
    deliverEmailWire: opts?.deliverEmailWire ?? deliverEnvelopeViaEmailWire,
  };
}
