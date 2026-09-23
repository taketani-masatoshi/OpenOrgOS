import type { DeliverProtocolEnvelopeOptions } from "../../protocol/transport/transport.js";
import { deliverEnvelopeViaGovGateway } from "./deliver.js";

/** Bind optional gov-gateway deliverer for protocol transport calls. */
export function withGovGatewayDeliver(
  opts?: DeliverProtocolEnvelopeOptions
): DeliverProtocolEnvelopeOptions {
  return {
    ...opts,
    deliverGovGateway: opts?.deliverGovGateway ?? deliverEnvelopeViaGovGateway,
  };
}
