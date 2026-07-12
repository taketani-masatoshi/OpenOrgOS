import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { WitnessAttestationSide } from "../../../schemas/protocol/witness-attestation.js";
import type { WitnessReceipt } from "../../../schemas/protocol/witness-receipt.js";
import { envelopeDigest } from "./canonical.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "./signing.js";
import { signWitnessAttestation } from "./witness-attestation-crypto.js";
import { transactionTypeSchema } from "../../../schemas/protocol/transaction-record.js";
import { getWitnessReceiptPath } from "./paths.js";
import { witnessReceiptSchema } from "../../../schemas/protocol/witness-receipt.js";

export function buildWitnessAttestationFromEnvelope(opts: {
  envelope: EventEnvelope;
  side: WitnessAttestationSide;
}) {
  const privateKeyPem = ensureProtocolSigningKey();
  const orgPublicKey = exportProtocolPublicKeyBase64();
  if (!orgPublicKey) {
    throw new Error("protocol signing key required for witness attestation");
  }

  const origin = opts.envelope.origin;
  const destination = opts.envelope.destination ?? { org_id: "unknown" };
  const payload = opts.envelope.event.payload;
  const txTypeParsed = transactionTypeSchema.safeParse(payload.transaction_type);
  const transaction_type = txTypeParsed.success
    ? txTypeParsed.data
    : String(payload.transaction_type ?? "unknown");

  const org_ref = opts.side === "sent" ? origin : destination;

  const unsigned = {
    event_id: opts.envelope.event_id,
    envelope_digest: envelopeDigest(opts.envelope),
    side: opts.side,
    origin,
    destination,
    transaction_type,
    attested_at: new Date().toISOString(),
    org_ref,
    org_public_key: orgPublicKey,
  };

  return signWitnessAttestation(unsigned, privateKeyPem);
}

export function cacheWitnessReceipt(receipt: WitnessReceipt): string {
  const path = getWitnessReceiptPath(receipt.event_id, receipt.hub_id);
  mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(path, JSON.stringify(receipt, null, 2), "utf-8");
  return path;
}

export function loadCachedWitnessReceipt(
  eventId: string,
  hubId: string
): WitnessReceipt | undefined {
  const path = getWitnessReceiptPath(eventId, hubId);
  if (!existsSync(path)) return undefined;
  return witnessReceiptSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export async function postAttestationToHub(
  hubUrl: string,
  attestation: ReturnType<typeof buildWitnessAttestationFromEnvelope>
): Promise<{ ok: boolean; receipt?: WitnessReceipt; error?: string }> {
  const base = hubUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/hub/v1/attestations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(attestation),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    receipt?: WitnessReceipt;
    issues?: string[];
    error?: string;
  };
  if (!res.ok || !body.ok) {
    return {
      ok: false,
      error: body.issues?.join("; ") ?? body.error ?? `HTTP ${res.status}`,
    };
  }
  if (body.receipt) {
    cacheWitnessReceipt(body.receipt);
  }
  return { ok: true, receipt: body.receipt };
}

export async function fetchReceiptFromHub(
  hubUrl: string,
  eventId: string
): Promise<WitnessReceipt | undefined> {
  const base = hubUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/hub/v1/receipts/${eventId}`);
  if (!res.ok) return undefined;
  const body = (await res.json()) as { receipt?: WitnessReceipt };
  if (body.receipt) {
    cacheWitnessReceipt(body.receipt);
  }
  return body.receipt;
}
