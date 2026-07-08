import { witnessReceiptSchema, type WitnessReceipt } from "../../../schemas/protocol/witness-receipt.js";
import type { WitnessAttestation } from "../../../schemas/protocol/witness-attestation.js";
import { appendJsonl, loadJsonl } from "../jsonl-store.js";
import { ensureHubSigningKey, signWitnessReceipt, verifyWitnessReceiptSignature } from "./signing.js";
import { appendHubAttestation, findAttestationsByEventId, getAttestationStatus } from "./registry.js";
import { verifyAndRegisterAttestationOrg } from "./attestation-verify.js";
import { getHubId, getHubReceiptsPath } from "./paths.js";

function generateReceiptId(): string {
  return `WRCPT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadHubReceipts(): WitnessReceipt[] {
  return loadJsonl(getHubReceiptsPath(), (raw) => witnessReceiptSchema.parse(raw));
}

export function findHubReceiptByEventId(eventId: string): WitnessReceipt | undefined {
  const receipts = loadHubReceipts().filter((r) => r.event_id === eventId);
  return receipts.length > 0 ? receipts[receipts.length - 1] : undefined;
}

export function rebuildHubReceiptForEvent(eventId: string): WitnessReceipt | undefined {
  const status = getAttestationStatus(eventId);
  const attestations = findAttestationsByEventId(eventId);
  if (attestations.length === 0) return undefined;

  const digest =
    status.sent?.envelope_digest ??
    status.received?.envelope_digest ??
    attestations[0]!.envelope_digest;

  const receiptStatus = status.digest_match ? "mutually_confirmed" : "unilateral";

  const unsigned = {
    receipt_id: generateReceiptId(),
    event_id: eventId,
    envelope_digest: digest,
    status: receiptStatus as WitnessReceipt["status"],
    attestations: attestations.map((a) => {
      const { attestation_id: _id, recorded_at: _at, ...base } = a;
      return base;
    }),
    issued_at: new Date().toISOString(),
    hub_id: getHubId(),
  };

  return signWitnessReceipt(unsigned, ensureHubSigningKey());
}

export function registerHubAttestation(attestation: WitnessAttestation): {
  ok: boolean;
  issues: string[];
  attestation_id?: string;
  receipt?: WitnessReceipt;
} {
  const verification = verifyAndRegisterAttestationOrg(attestation);
  if (!verification.ok) {
    return { ok: false, issues: verification.issues };
  }

  const stored = appendHubAttestation(attestation);
  const receipt = rebuildHubReceiptForEvent(attestation.event_id);
  if (receipt) {
    appendJsonl(getHubReceiptsPath(), receipt);
  }

  return {
    ok: true,
    issues: [],
    attestation_id: stored.attestation_id,
    receipt,
  };
}

export function verifyHubReceipt(receipt: WitnessReceipt, hubPublicKey: string): boolean {
  return verifyWitnessReceiptSignature(receipt, hubPublicKey);
}
