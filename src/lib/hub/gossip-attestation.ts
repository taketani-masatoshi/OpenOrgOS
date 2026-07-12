import type { WitnessAttestation } from "../../../schemas/protocol/witness-attestation.js";
import { witnessAttestationSchema } from "../../../schemas/protocol/witness-attestation.js";
import { appendJsonl } from "../jsonl-store.js";
import { loadHubAttestations, type StoredWitnessAttestation } from "./registry.js";
import { verifyAndRegisterAttestationOrg } from "./attestation-verify.js";
import { appendHubAttestation } from "./registry.js";
import { rebuildHubReceiptForEvent } from "./receipt.js";
import { getHubReceiptsPath } from "./paths.js";

export interface AttestationGossipExport {
  exported_at: string;
  since?: string;
  cursor?: string;
  next_cursor?: string;
  attestation_count: number;
  attestations: WitnessAttestation[];
}

function toWireAttestation(stored: StoredWitnessAttestation): WitnessAttestation {
  const { attestation_id: _id, recorded_at: _at, ...wire } = stored;
  return witnessAttestationSchema.parse(wire);
}

export function exportAttestationGossip(opts?: {
  since?: string;
  cursor?: string;
  limit?: number;
}): AttestationGossipExport {
  const limit = opts?.limit ?? 100;
  let items = loadHubAttestations().sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

  if (opts?.since) {
    items = items.filter((a) => a.recorded_at >= opts.since!);
  }
  if (opts?.cursor) {
    items = items.filter((a) => a.recorded_at > opts.cursor!);
  }

  const page = items.slice(0, limit);
  const last = page[page.length - 1];
  return {
    exported_at: new Date().toISOString(),
    since: opts?.since,
    cursor: opts?.cursor,
    next_cursor: last?.recorded_at,
    attestation_count: page.length,
    attestations: page.map(toWireAttestation),
  };
}

export interface AttestationImportResult {
  imported: number;
  skipped: number;
  receipts_rebuilt: number;
  issues: string[];
  affected_event_ids: string[];
}

export function importAttestationGossip(
  attestations: WitnessAttestation[]
): AttestationImportResult {
  const issues: string[] = [];
  let imported = 0;
  let skipped = 0;
  let receiptsRebuilt = 0;
  const affected = new Set<string>();

  for (const raw of attestations) {
    const parsed = witnessAttestationSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push(`invalid attestation: ${parsed.error.message}`);
      skipped++;
      continue;
    }
    const attestation = parsed.data;
    const verification = verifyAndRegisterAttestationOrg(attestation);
    if (!verification.ok) {
      issues.push(`${attestation.event_id}/${attestation.side}: ${verification.issues.join("; ")}`);
      skipped++;
      continue;
    }

    try {
      const before = loadHubAttestations().find(
        (a) =>
          a.event_id === attestation.event_id &&
          a.side === attestation.side &&
          a.org_ref.org_id === attestation.org_ref.org_id
      );
      appendHubAttestation(attestation);
      if (before) {
        skipped++;
      } else {
        imported++;
      }
      affected.add(attestation.event_id);
    } catch (e) {
      issues.push(`${attestation.event_id}: ${e instanceof Error ? e.message : String(e)}`);
      skipped++;
    }
  }

  for (const eventId of affected) {
    const receipt = rebuildHubReceiptForEvent(eventId);
    if (receipt) {
      appendJsonl(getHubReceiptsPath(), receipt);
      receiptsRebuilt++;
    }
  }

  return {
    imported,
    skipped,
    receipts_rebuilt: receiptsRebuilt,
    issues,
    affected_event_ids: [...affected],
  };
}

/** @deprecated Use importAttestationGossip — receipt import mixes foreign hub_id into local SoT */
export function importGossipReceiptsDeprecated(): never {
  throw new Error("importGossipReceipts is deprecated — use attestation gossip import");
}
