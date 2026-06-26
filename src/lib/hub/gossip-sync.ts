import type { WitnessHubEntry } from "../../../schemas/protocol/witness-pool.js";
import { importAttestationGossip, type AttestationGossipExport } from "./gossip-attestation.js";
import {
  loadHubFederation,
  loadGossipCursor,
  updateGossipCursor,
  findFederationPeer,
} from "./federation.js";

export interface GossipSyncResult {
  peer_id: string;
  imported: number;
  skipped: number;
  receipts_rebuilt: number;
  issues: string[];
  cursor?: string;
}

export async function fetchAttestationsFromPeer(
  peer: WitnessHubEntry,
  opts?: { since?: string; cursor?: string }
): Promise<AttestationGossipExport> {
  const base = peer.hub_url.replace(/\/$/, "");
  const params = new URLSearchParams();
  if (opts?.since) params.set("since", opts.since);
  if (opts?.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  const url = `${base}/hub/v1/gossip/attestations${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`gossip fetch failed: HTTP ${res.status}`);
  }
  return (await res.json()) as AttestationGossipExport;
}

export async function syncFromPeer(peerId: string): Promise<GossipSyncResult> {
  const peer = findFederationPeer(peerId);
  if (!peer) {
    throw new Error(`Peer ${peerId} not in hub-federation.yaml`);
  }

  const cursor = loadGossipCursor(peerId);
  const exportData = await fetchAttestationsFromPeer(peer, {
    cursor: cursor?.last_recorded_at,
  });

  const result = importAttestationGossip(exportData.attestations);

  if (exportData.next_cursor) {
    updateGossipCursor(peerId, exportData.next_cursor);
  }

  return {
    peer_id: peerId,
    imported: result.imported,
    skipped: result.skipped,
    receipts_rebuilt: result.receipts_rebuilt,
    issues: result.issues,
    cursor: exportData.next_cursor,
  };
}

export async function syncAllPeers(): Promise<GossipSyncResult[]> {
  const federation = loadHubFederation();
  if (!federation.gossip.enabled || federation.hub_peers.length === 0) {
    return [];
  }

  const results: GossipSyncResult[] = [];
  for (const peer of federation.hub_peers) {
    try {
      results.push(await syncFromPeer(peer.hub_id));
    } catch (e) {
      results.push({
        peer_id: peer.hub_id,
        imported: 0,
        skipped: 0,
        receipts_rebuilt: 0,
        issues: [e instanceof Error ? e.message : String(e)],
      });
    }
  }
  return results;
}

export function startGossipSyncInterval(intervalSec: number): () => void {
  const handle = setInterval(() => {
    syncAllPeers().catch(() => {
      /* best-effort background sync */
    });
  }, intervalSec * 1000);
  return () => clearInterval(handle);
}
