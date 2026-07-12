import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { WitnessAttestationSide } from "../../../schemas/protocol/witness-attestation.js";
import type { WitnessReceipt } from "../../../schemas/protocol/witness-receipt.js";
import type { WitnessQuorumResult } from "../../../schemas/protocol/witness-quorum.js";
import type { WitnessPoolConfig } from "../../../schemas/protocol/witness-pool.js";
import { loadWitnessPoolConfig, sortedHubs, isWitnessEnabled } from "./witness-pool.js";
import {
  enqueueWitnessPending,
  archiveWitnessPending,
  listWitnessPending,
} from "./witness-queue.js";
import {
  buildWitnessAttestationFromEnvelope,
  loadCachedWitnessReceipt,
  postAttestationToHub,
  fetchReceiptFromHub,
} from "./witness-attestation-build.js";
import { evaluateWitnessQuorum, checkWitnessPoolHealth } from "./witness-quorum.js";
import { verifyWitnessReceiptSignature } from "../hub/signing.js";
import { parseEventEnvelope } from "./envelope.js";
import { getProtocolInboxDir, getProtocolOutboxDir } from "./paths.js";
import {
  emitWitnessAttestationRegistered,
  emitWitnessReceiptIssued,
} from "./witness-envelope-emit.js";

export function findEnvelopeFileForWitness(eventId: string): EventEnvelope | undefined {
  for (const dir of [getProtocolOutboxDir(), getProtocolInboxDir()]) {
    const direct = join(dir, `${eventId}.json`);
    if (existsSync(direct)) {
      return parseEventEnvelope(JSON.parse(readFileSync(direct, "utf-8")));
    }
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json") || file.endsWith(".steward-provenance.json")) continue;
        const env = parseEventEnvelope(JSON.parse(readFileSync(join(dir, file), "utf-8")));
        if (env.event_id === eventId) return env;
      }
    }
  }
  return undefined;
}

export { buildWitnessAttestationFromEnvelope, cacheWitnessReceipt, loadCachedWitnessReceipt } from "./witness-attestation-build.js";

export interface FanOutResult {
  succeeded: string[];
  failed: { hub_id: string; error: string }[];
  receipts: WitnessReceipt[];
  quorum: WitnessQuorumResult;
}

export async function registerWitnessAttestationFanOut(opts: {
  envelope: EventEnvelope;
  side: WitnessAttestationSide;
  pool?: WitnessPoolConfig;
}): Promise<FanOutResult | null> {
  const pool = opts.pool ?? loadWitnessPoolConfig();
  if (!isWitnessEnabled(pool)) return null;

  const attestation = buildWitnessAttestationFromEnvelope({ envelope: opts.envelope, side: opts.side });
  const digest = attestation.envelope_digest;
  const succeeded: string[] = [];
  const failed: { hub_id: string; error: string }[] = [];
  const receipts: WitnessReceipt[] = [];

  const hubs = sortedHubs(pool);
  const results = await Promise.allSettled(
    hubs.map(async (hub) => {
      const result = await postAttestationToHub(hub.hub_url, attestation);
      if (!result.ok) {
        enqueueWitnessPending({
          hub_id: hub.hub_id,
          event_id: attestation.event_id,
          side: opts.side,
          envelope_digest: digest,
          last_error: result.error,
        });
        throw new Error(result.error ?? "unknown");
      }
      archiveWitnessPending(hub.hub_id, attestation.event_id, opts.side, "attested");
      try {
        emitWitnessAttestationRegistered(attestation, hub.hub_id);
      } catch {
        /* audit emit is best-effort */
      }
      if (result.receipt) {
        receipts.push(result.receipt);
        try {
          emitWitnessReceiptIssued(result.receipt);
        } catch {
          /* audit emit is best-effort */
        }
      } else {
        const fetched = await fetchReceiptFromHub(hub.hub_url, attestation.event_id);
        if (fetched) {
          receipts.push(fetched);
          try {
            emitWitnessReceiptIssued(fetched);
          } catch {
            /* audit emit is best-effort */
          }
        }
      }
      return hub.hub_id;
    })
  );

  for (let i = 0; i < results.length; i++) {
    const hub = hubs[i]!;
    const r = results[i]!;
    if (r.status === "fulfilled") {
      succeeded.push(r.value);
    } else {
      failed.push({
        hub_id: hub.hub_id,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  const quorum = evaluateWitnessQuorum({
    eventId: attestation.event_id,
    digest,
    receipts,
    pool,
  });

  return { succeeded, failed, receipts, quorum };
}

export async function flushWitnessPending(pool?: WitnessPoolConfig): Promise<number> {
  const cfg = pool ?? loadWitnessPoolConfig();
  if (!isWitnessEnabled(cfg)) return 0;

  let flushed = 0;
  for (const entry of listWitnessPending()) {
    const hub = sortedHubs(cfg).find((h) => h.hub_id === entry.hub_id);
    if (!hub) continue;

    const healthy = await checkWitnessPoolHealth(cfg);
    if (!healthy.find((h) => h.hub_id === hub.hub_id)?.ok) continue;

    const envelope = findEnvelopeFileForWitness(entry.event_id);
    if (!envelope) continue;

    const attestation = buildWitnessAttestationFromEnvelope({ envelope, side: entry.side });
    const post = await postAttestationToHub(hub.hub_url, attestation);
    if (post.ok) {
      archiveWitnessPending(entry.hub_id, entry.event_id, entry.side, "attested");
      flushed++;
    } else {
      enqueueWitnessPending({
        ...entry,
        last_error: post.error,
      });
    }
  }
  return flushed;
}

export function verifyCachedReceiptsForEvent(
  eventId: string,
  pool?: WitnessPoolConfig
): { receipts: WitnessReceipt[]; quorum: WitnessQuorumResult; issues: string[] } {
  const cfg = pool ?? loadWitnessPoolConfig();
  const issues: string[] = [];
  const receipts: WitnessReceipt[] = [];

  for (const hub of sortedHubs(cfg)) {
    const cached = loadCachedWitnessReceipt(eventId, hub.hub_id);
    if (!cached) continue;
    if (!verifyWitnessReceiptSignature(cached, hub.hub_public_key)) {
      issues.push(`${hub.hub_id}: invalid hub_signature`);
      continue;
    }
    receipts.push(cached);
  }

  const digest = receipts[0]?.envelope_digest ?? "0".repeat(64);
  const quorum = evaluateWitnessQuorum({ eventId, digest, receipts, pool: cfg });
  return { receipts, quorum, issues };
}

export async function fetchReceiptsFromPool(
  eventId: string,
  pool?: WitnessPoolConfig
): Promise<WitnessReceipt[]> {
  const cfg = pool ?? loadWitnessPoolConfig();
  const receipts: WitnessReceipt[] = [];
  for (const hub of sortedHubs(cfg)) {
    const cached = loadCachedWitnessReceipt(eventId, hub.hub_id);
    if (cached) {
      receipts.push(cached);
      continue;
    }
    const fetched = await fetchReceiptFromHub(hub.hub_url, eventId);
    if (fetched) receipts.push(fetched);
  }
  return receipts;
}

export { checkWitnessPoolHealth };
