import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import type { PeerEndpoint } from "../../../../schemas/protocol/peer-endpoint.js";

/** Explicit gov-gateway deliverer — transport must not import wire/gov-gateway. */
export type GovGatewayDeliverFn = (options: {
  envelope: EventEnvelope;
  peerId: string;
  endpoint: PeerEndpoint;
  tenantId: string;
}) => Promise<{ ok: boolean; reason: string; httpStatus?: number }>;
