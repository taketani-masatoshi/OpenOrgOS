import type {
  ResilienceSlaEvaluation,
  ResilienceSlaTier,
} from "../../../schemas/protocol/resilience-sla.js";
import { findTransactionByEventId } from "./transactions.js";
import { listWirePending } from "./wire-queue.js";
import { isEventDelivered } from "./wire-delivered.js";
import { listWitnessPending } from "./witness-queue.js";
import { loadWitnessPoolConfig, isWitnessEnabled } from "./witness-pool.js";
import { verifyCachedReceiptsForEvent } from "./witness-client.js";

import { hasSuccessfulEmailWireFallback, hasSuccessfulEmailWireIngest } from "./delivery-ledger.js";

const TIER_REQUIREMENTS: Record<
  ResilienceSlaTier,
  Array<"committed" | "delivered" | "attested" | "email_fallback" | "bidirectional">
> = {
  bronze: ["committed"],
  silver: ["committed", "delivered"],
  "silver-email": ["committed", "delivered", "email_fallback"],
  gold: ["committed", "delivered", "attested"],
  platinum: ["committed", "delivered", "email_fallback", "bidirectional"],
};

export function resolveTransactionSlaState(eventId: string): {
  committed: boolean;
  delivered: boolean;
  attested: boolean;
  email_fallback: boolean;
  bidirectional: boolean;
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
  const email_fallback = hasSuccessfulEmailWireFallback();
  const bidirectional = email_fallback && hasSuccessfulEmailWireIngest();
  return { committed, delivered, attested, email_fallback, bidirectional };
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
  if (required.includes("email_fallback") && !states.email_fallback) missing.push("email_fallback");
  if (required.includes("bidirectional") && !states.bidirectional) missing.push("bidirectional");

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
