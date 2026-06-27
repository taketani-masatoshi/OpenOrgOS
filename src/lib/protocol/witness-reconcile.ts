import type { WitnessQuorumResult } from "../../../schemas/protocol/witness-quorum.js";
import { findTransactionByEventId, listTransactions } from "./transactions.js";
import { findPeer } from "./peers.js";
import { loadWitnessPoolConfig, isWitnessEnabled } from "./witness-pool.js";
import { listWitnessPending } from "./witness-queue.js";
import { listWirePending } from "./wire-queue.js";
import { verifyCachedReceiptsForEvent, fetchReceiptsFromPool } from "./witness-client.js";
import { findEnvelopeFileForWitness } from "./witness-client.js";
import { verifyProtocolAuditChain } from "./audit-chain.js";

export type ReconcileSeverity = "error" | "warning" | "info";

export interface ReconcileAlert {
  severity: ReconcileSeverity;
  code: string;
  message: string;
  event_id?: string;
}

export interface ReconcileResult {
  peer_id: string;
  checked: number;
  alerts: ReconcileAlert[];
  quorum_ok: number;
  quorum_fail: number;
}

export async function reconcileWitnessWithPeer(opts: {
  peerId: string;
  since?: string;
  eventId?: string;
}): Promise<ReconcileResult> {
  const peer = findPeer(opts.peerId);
  if (!peer) {
    throw new Error(`Peer ${opts.peerId} not found`);
  }

  const pool = loadWitnessPoolConfig();
  const alerts: ReconcileAlert[] = [];
  let quorumOk = 0;
  let quorumFail = 0;

  const txs = listTransactions({ peerId: opts.peerId, since: opts.since }).filter((t) => {
    if (opts.eventId && t.event_id !== opts.eventId) return false;
    return t.direction === "outbound";
  });

  for (const tx of txs) {
    const eventId = tx.event_id;

    if (!findEnvelopeFileForWitness(eventId)) {
      alerts.push({
        severity: "error",
        code: "envelope-missing",
        message: `No outbox/inbox envelope for event ${eventId}`,
        event_id: eventId,
      });
    }

    const wirePending = listWirePending().find(
      (p) => p.peer_id === opts.peerId && p.event_id === eventId
    );
    if (wirePending) {
      alerts.push({
        severity: "warning",
        code: "wire-pending",
        message: `Wire delivery pending (${wirePending.attempts} attempts): ${wirePending.last_error ?? "unknown"}`,
        event_id: eventId,
      });
    }

    const witnessPending = listWitnessPending().filter((p) => p.event_id === eventId);
    for (const wp of witnessPending) {
      alerts.push({
        severity: "warning",
        code: "witness-pending",
        message: `Witness pending ${wp.side} on ${wp.hub_id}: ${wp.last_error ?? "unknown"}`,
        event_id: eventId,
      });
    }

    if (isWitnessEnabled(pool)) {
      await fetchReceiptsFromPool(eventId, pool);
      const { receipts, quorum, issues } = verifyCachedReceiptsForEvent(eventId, pool);
      for (const issue of issues) {
        alerts.push({
          severity: "error",
          code: "receipt-invalid",
          message: issue,
          event_id: eventId,
        });
      }

      const confirmed = receipts.filter((r) => r.status === "mutually_confirmed");
      if (confirmed.length === 0 && receipts.length > 0) {
        alerts.push({
          severity: "warning",
          code: "witness-unilateral-only",
          message: `Only unilateral witness receipts (${receipts.length} hub(s))`,
          event_id: eventId,
        });
      }

      if (quorum.satisfied) {
        quorumOk++;
      } else {
        quorumFail++;
        alerts.push({
          severity: "error",
          code: "quorum-fail",
          message: `Witness quorum not satisfied (${quorum.matched}/${quorum.required})`,
          event_id: eventId,
        });
      }
    }

    const localTx = findTransactionByEventId(eventId);
    if (!localTx) {
      alerts.push({
        severity: "error",
        code: "tx-missing",
        message: `Transaction record missing for event ${eventId}`,
        event_id: eventId,
      });
    }
  }

  const audit = verifyProtocolAuditChain({ since: opts.since });
  if (!audit.ok) {
    for (const issue of audit.issues) {
      alerts.push({
        severity: "error",
        code: "audit-chain",
        message: `${issue.audit_id}: ${issue.message}`,
      });
    }
  }

  return {
    peer_id: opts.peerId,
    checked: txs.length,
    alerts,
    quorum_ok: quorumOk,
    quorum_fail: quorumFail,
  };
}

async function fetchHubAttestationStatus(
  hubUrl: string,
  eventId: string
): Promise<{ hub_id?: string; sent?: boolean; received?: boolean; digest_match?: boolean } | null> {
  const base = hubUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/hub/v1/attestations/${eventId}`);
  if (!res.ok) return null;
  return (await res.json()) as {
    hub_id?: string;
    sent?: boolean;
    received?: boolean;
    digest_match?: boolean;
  };
}

export async function reconcileCrossHub(opts?: {
  since?: string;
  eventId?: string;
}): Promise<{ checked: number; alerts: ReconcileAlert[] }> {
  const pool = loadWitnessPoolConfig();
  const alerts: ReconcileAlert[] = [];
  if (!isWitnessEnabled(pool)) {
    return { checked: 0, alerts: [{ severity: "warning", code: "witness-disabled", message: "Witness pool disabled" }] };
  }

  const eventIds = new Set<string>();
  for (const tx of listTransactions({ since: opts?.since })) {
    if (opts?.eventId && tx.event_id !== opts.eventId) continue;
    eventIds.add(tx.event_id);
  }

  for (const eventId of eventIds) {
    const statuses: Array<{ hub_id: string; status: Awaited<ReturnType<typeof fetchHubAttestationStatus>> }> = [];
    for (const hub of pool.hubs) {
      const status = await fetchHubAttestationStatus(hub.hub_url, eventId);
      statuses.push({ hub_id: hub.hub_id, status });
    }

    const withData = statuses.filter((s) => s.status != null);
    if (withData.length === 0) {
      alerts.push({
        severity: "warning",
        code: "hub-unreachable",
        message: `No hub returned attestation status for ${eventId}`,
        event_id: eventId,
      });
      continue;
    }

    const digestMatches = withData.map((s) => s.status?.digest_match ?? false);
    const allMatch = digestMatches.every((v) => v === digestMatches[0]);
    if (!allMatch) {
      alerts.push({
        severity: "error",
        code: "hub-drift",
        message: `Hub digest_match drift for ${eventId}`,
        event_id: eventId,
      });
    }

    const hasSent = withData.some((s) => !!s.status?.sent);
    const hasReceived = withData.some((s) => !!s.status?.received);
    if (hasSent && !hasReceived) {
      alerts.push({
        severity: "warning",
        code: "partial-attestation",
        message: `sent without received on some hubs for ${eventId}`,
        event_id: eventId,
      });
    }

    const roots = new Set<string>();
    for (const hub of pool.hubs) {
      const base = hub.hub_url.replace(/\/$/, "");
      const res = await fetch(`${base}/hub/v1/anchor?date=${new Date().toISOString().slice(0, 10)}`);
      if (res.ok) {
        const body = (await res.json()) as { anchor?: { merkle_root?: string } };
        if (body.anchor?.merkle_root) roots.add(body.anchor.merkle_root);
      }
    }
    if (roots.size > 1) {
      alerts.push({
        severity: "warning",
        code: "anchor-mismatch",
        message: `Merkle root differs across hubs for ${eventId} context (${roots.size} roots)`,
        event_id: eventId,
      });
    }
  }

  return { checked: eventIds.size, alerts };
}

export function summarizeQuorum(results: WitnessQuorumResult[]): { ok: number; fail: number } {
  return results.reduce(
    (acc, q) => {
      if (q.satisfied) acc.ok++;
      else acc.fail++;
      return acc;
    },
    { ok: 0, fail: 0 }
  );
}
