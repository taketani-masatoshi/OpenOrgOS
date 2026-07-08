import { appendJsonl, loadJsonl } from "../jsonl-store.js";
import type { WitnessReceipt } from "../../../schemas/protocol/witness-receipt.js";
import { witnessReceiptSchema } from "../../../schemas/protocol/witness-receipt.js";
import { verifyWitnessReceiptSignature } from "./signing.js";
import { loadHubReceipts, findHubReceiptByEventId } from "./receipt.js";
import { getHubReceiptsPath } from "./paths.js";

export interface GossipSnapshot {
  exported_at: string;
  since?: string;
  receipt_count: number;
  receipts: WitnessReceipt[];
}

export function exportGossipSnapshot(since?: string): GossipSnapshot {
  let receipts = loadHubReceipts();
  if (since) {
    receipts = receipts.filter((r) => r.issued_at >= since);
  }
  return {
    exported_at: new Date().toISOString(),
    since,
    receipt_count: receipts.length,
    receipts,
  };
}

export interface GossipImportResult {
  imported: number;
  skipped: number;
  issues: string[];
}

/**
 * @deprecated Use attestation gossip (POST /hub/v1/gossip/attestations/import).
 * Importing foreign hub receipts mixes hub_id into local SoT.
 */
export function importGossipReceipts(
  receipts: WitnessReceipt[],
  hubPublicKey: string
): GossipImportResult {
  const issues: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const raw of receipts) {
    const parsed = witnessReceiptSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push(`invalid receipt schema: ${parsed.error.message}`);
      skipped++;
      continue;
    }
    const receipt = parsed.data;
    if (!verifyWitnessReceiptSignature(receipt, hubPublicKey)) {
      issues.push(`invalid signature for ${receipt.receipt_id}`);
      skipped++;
      continue;
    }
    const existing = findHubReceiptByEventId(receipt.event_id);
    if (existing && existing.receipt_id === receipt.receipt_id) {
      skipped++;
      continue;
    }
    appendJsonl(getHubReceiptsPath(), receipt);
    imported++;
  }

  return { imported, skipped, issues };
}

export function loadGossipReceiptsSince(since?: string): WitnessReceipt[] {
  const all = loadJsonl(getHubReceiptsPath(), (raw) => witnessReceiptSchema.parse(raw));
  if (!since) return all;
  return all.filter((r) => r.issued_at >= since);
}
