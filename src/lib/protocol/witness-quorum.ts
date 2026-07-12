import type { WitnessReceipt } from "../../../schemas/protocol/witness-receipt.js";
import type { WitnessQuorumResult } from "../../../schemas/protocol/witness-quorum.js";
import type { WitnessPoolConfig } from "../../../schemas/protocol/witness-pool.js";
import { sortedHubs } from "./witness-pool.js";

export function requiredQuorumCount(pool: WitnessPoolConfig): number {
  const n = pool.hubs.length;
  if (n === 0) return 0;
  switch (pool.quorum.mode) {
    case "any_of_n":
      return 1;
    case "k_of_n":
      return pool.quorum.k ?? 1;
    case "all_of_n":
      return n;
    default:
      return 1;
  }
}

export function evaluateWitnessQuorum(opts: {
  eventId: string;
  digest: string;
  receipts: WitnessReceipt[];
  pool: WitnessPoolConfig;
}): WitnessQuorumResult {
  const confirmed = opts.receipts.filter(
    (r) =>
      r.status === "mutually_confirmed" &&
      r.envelope_digest === opts.digest &&
      r.event_id === opts.eventId
  );
  const required = requiredQuorumCount(opts.pool);
  const matched = confirmed.length;
  return {
    event_id: opts.eventId,
    digest: opts.digest,
    receipts: opts.receipts,
    satisfied: matched >= required,
    required,
    matched,
    mode: opts.pool.quorum.mode,
  };
}

export async function checkHubHealth(hubUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${hubUrl.replace(/\/$/, "")}/hub/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkWitnessPoolHealth(
  pool?: WitnessPoolConfig
): Promise<{ hub_id: string; ok: boolean; url: string }[]> {
  const hubs = sortedHubs(pool);
  const results = await Promise.all(
    hubs.map(async (hub) => ({
      hub_id: hub.hub_id,
      url: hub.hub_url,
      ok: await checkHubHealth(hub.hub_url),
    }))
  );
  return results;
}
