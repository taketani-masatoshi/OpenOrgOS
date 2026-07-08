import type { GovGatewayProfileId } from "../../../../schemas/protocol/gov-gateway-adapter.js";
import type { GovGatewayAdapter } from "../types.js";

export function createStubAdapter(
  profileId: GovGatewayProfileId,
  reason: string
): GovGatewayAdapter {
  const fail = () => {
    throw new Error(`GovGatewayAdapter stub (${profileId}): ${reason}`);
  };
  return {
    profile_id: profileId,
    encode: async () => fail(),
    decode: async () => fail(),
    deliver: async () => ({ ok: false, detail: reason }),
    health: async () => ({ ok: false, profile_id: profileId, detail: reason }),
  };
}
