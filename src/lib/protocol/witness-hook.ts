import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { WitnessAttestationSide } from "../../../schemas/protocol/witness-attestation.js";
import { shouldRegisterWitnessSide } from "./witness-pool.js";
import { registerWitnessAttestationFanOut, type FanOutResult } from "./witness-client.js";

export async function maybeRegisterWitnessAfterWire(
  envelope: EventEnvelope,
  side: WitnessAttestationSide
): Promise<FanOutResult | null> {
  if (!shouldRegisterWitnessSide(side)) return null;
  try {
    return await registerWitnessAttestationFanOut({ envelope, side });
  } catch {
    return null;
  }
}

export function formatWitnessFanOutSummary(result: FanOutResult | null): string | undefined {
  if (!result) return undefined;
  const total = result.succeeded.length + result.failed.length;
  const q = result.quorum.satisfied ? "satisfied" : "pending";
  return `witness: ${result.succeeded.length}/${total} hubs · quorum ${q} (${result.quorum.matched}/${result.quorum.required})`;
}
