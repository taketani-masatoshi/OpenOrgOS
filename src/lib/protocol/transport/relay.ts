import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import { loadContracts } from "../../data.js";
import { loadTenantConfig } from "../../tenant.js";
import { protocolHttpFetch } from "../protocol-http-client.js";

function relayApiOrigin(bundleOrApiUrl: string): string {
  return new URL(bundleOrApiUrl).origin;
}

/** Receiver pulls pending envelopes from Org C relay API (Proposal 3). */
export async function flushWireRelayInbox(relayApiBase: string): Promise<number> {
  const { ingestWebhook } = await import("../../webhook.js");
  const tenant = loadTenantConfig();
  const destinationOrgUri = `steward://tenant/${tenant.id}`;
  const base = relayApiOrigin(relayApiBase);
  const inboxUrl = `${base}/protocol/v1/relay/inbox?destination_org_uri=${encodeURIComponent(destinationOrgUri)}`;

  let res: Response;
  try {
    res = await protocolHttpFetch(inboxUrl);
  } catch {
    return 0;
  }
  if (!res.ok) return 0;

  const body = (await res.json()) as {
    ok?: boolean;
    queue?: Array<{
      relay_id: string;
      event_id: string;
      envelope?: EventEnvelope;
    }>;
  };
  if (!body.ok || !body.queue?.length) return 0;

  let pulled = 0;
  for (const entry of body.queue) {
    if (!entry.envelope) continue;
    const ingest = ingestWebhook({ raw: entry.envelope });
    if (!ingest.ok && ingest.reason !== "idempotent") continue;
    try {
      await protocolHttpFetch(`${base}/protocol/v1/relay/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relay_id: entry.relay_id }),
      });
    } catch {
      /* ack best-effort */
    }
    pulled++;
  }
  return pulled;
}

/** Pull Org C relay for any contract with witness_trust_bundle_url. */
export async function pullOrgCRelayInboxIfConfigured(): Promise<number> {
  let total = 0;
  const seen = new Set<string>();
  for (const contract of loadContracts()) {
    const bundleUrl = contract.protocol?.witness_trust_bundle_url;
    if (!bundleUrl) continue;
    const origin = relayApiOrigin(bundleUrl);
    if (seen.has(origin)) continue;
    seen.add(origin);
    total += await flushWireRelayInbox(origin);
  }
  return total;
}

export { listWireRelayPending } from "../wire-relay-store.js";
