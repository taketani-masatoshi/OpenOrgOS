import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { ResilienceSlaEvaluation, ResilienceSlaTier } from "../../../schemas/protocol/resilience-sla.js";
import { findTransactionByEventId } from "./transactions.js";
import { listWirePending } from "./wire-queue.js";
import { isEventDelivered } from "./wire-delivered.js";
import { listWitnessPending } from "./witness-queue.js";
import { loadWitnessPoolConfig, isWitnessEnabled } from "./witness-pool.js";
import { verifyCachedReceiptsForEvent } from "./witness-client.js";

const TIER_REQUIREMENTS: Record<ResilienceSlaTier, Array<"committed" | "delivered" | "attested">> = {
  bronze: ["committed"],
  silver: ["committed", "delivered"],
  gold: ["committed", "delivered", "attested"],
};

export function resolveTransactionSlaState(eventId: string): {
  committed: boolean;
  delivered: boolean;
  attested: boolean;
} {
  const tx = findTransactionByEventId(eventId);
  const committed = !!tx;
  const wirePending = listWirePending().some((p) => p.event_id === eventId);
  const delivered =
    tx?.direction === "inbound"
      ? committed
      : committed && !wirePending && isEventDelivered(eventId);
  let attested = false;
  const pool = loadWitnessPoolConfig();
  if (isWitnessEnabled(pool)) {
    const witnessPending = listWitnessPending().some((p) => p.event_id === eventId);
    if (!witnessPending) {
      const { quorum } = verifyCachedReceiptsForEvent(eventId, pool);
      attested = quorum.satisfied;
    }
  }
  return { committed, delivered, attested };
}

export function evaluateTransactionSla(
  eventId: string,
  tier: ResilienceSlaTier
): ResilienceSlaEvaluation {
  const states = resolveTransactionSlaState(eventId);
  const required = TIER_REQUIREMENTS[tier];
  const missing: string[] = [];
  let current: "committed" | "delivered" | "attested" = "committed";

  if (states.attested) current = "attested";
  else if (states.delivered) current = "delivered";

  if (required.includes("committed") && !states.committed) missing.push("committed");
  if (required.includes("delivered") && !states.delivered) missing.push("delivered");
  if (required.includes("attested") && !states.attested) missing.push("attested");

  return {
    event_id: eventId,
    tier,
    state: current,
    satisfied: missing.length === 0,
    missing,
  };
}

export function defaultSlaTierForContract(monthlyCost?: number): ResilienceSlaTier {
  if (monthlyCost != null && monthlyCost > 1_000_000) return "gold";
  if (monthlyCost != null && monthlyCost > 100_000) return "silver";
  return "bronze";
}
