/**
 * Claimant side: ingest a signed receipt and claim it at the issuer over Wire.
 * Path: src/lib/receipt-qr/claimant.ts
 *
 * The Wire claim carries receipt id, digest and claim key only — never
 * amounts or lines (ADR 0032).
 */
import { randomUUID } from "node:crypto";
import type { SignedReceiptQrPayload } from "../../../schemas/receipt-qr.js";
import { ourOrgRef } from "../protocol/identity.js";
import { maybeSignEnvelope } from "../protocol/signing.js";
import { decodeReceiptLink } from "./link-codec.js";
import { saveVerifiedReceiptSnapshot } from "./payload-store.js";
import { verifySignedReceiptPayload } from "./signature.js";

/** Plain HTTP is tolerated only for a localhost demo issuer. */
function assertHttpsOrLocalDemo(endpoint: URL, message: string): void {
  const localDemo =
    endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost";
  if (endpoint.protocol !== "https:" && !localDemo) {
    throw new Error(message);
  }
}

export async function fetchSignedReceiptOnline(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<SignedReceiptQrPayload> {
  assertHttpsOrLocalDemo(
    new URL(url),
    "Receipt fetch requires HTTPS (HTTP allowed only for localhost demo)",
  );
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Receipt fetch failed: HTTP ${response.status}`);
  }
  const raw = await response.json();
  const verified = verifySignedReceiptPayload(raw);
  if (!verified.ok || !verified.payload) {
    throw new Error(`Fetched receipt invalid: ${verified.reason}`);
  }
  return verified.payload;
}

function parseSignedReceiptInput(input: string): SignedReceiptQrPayload | undefined {
  const trimmed = input.trim();
  try {
    return decodeReceiptLink(trimmed);
  } catch {
    // Not a link; a pasted JSON payload is tried below.
  }
  if (!trimmed.startsWith("{")) return undefined;
  const verified = verifySignedReceiptPayload(JSON.parse(trimmed) as unknown);
  return verified.ok ? verified.payload : undefined;
}

/**
 * Ingest from QR link / JSON paste. Prefers embedded signed payload;
 * if fetch_url is present, re-fetches online source of truth.
 */
export async function ingestReceiptQrPayload(
  input: string,
  fetchFn: typeof fetch = fetch,
): Promise<{
  payload: SignedReceiptQrPayload;
  snapshot_path: string;
}> {
  let payload = parseSignedReceiptInput(input);
  if (!payload) {
    throw new Error(
      "Signed receipt payload required (QR link or JSON). Unsigned manual draft is disabled by default.",
    );
  }
  if (payload.receipt.fetch_url) {
    payload = await fetchSignedReceiptOnline(payload.receipt.fetch_url, fetchFn);
  }
  const verified = verifySignedReceiptPayload(payload);
  if (!verified.ok || !verified.payload) {
    throw new Error(`Receipt verification failed: ${verified.reason}`);
  }
  const snapshot_path = saveVerifiedReceiptSnapshot(verified.payload);
  return { payload: verified.payload, snapshot_path };
}

export async function claimReceiptRemotely(
  payload: SignedReceiptQrPayload,
  fetchFn: typeof fetch = fetch,
): Promise<{
  status: number;
  body: Record<string, unknown>;
  event_id: string;
}> {
  const verified = verifySignedReceiptPayload(payload);
  if (!verified.ok || !verified.payload) {
    throw new Error(verified.reason ?? "invalid receipt payload");
  }
  const endpointRaw = verified.payload.receipt.claim?.endpoint;
  if (!endpointRaw) {
    throw new Error("Receipt claim.endpoint is required for Wire claim");
  }
  const endpoint = new URL(endpointRaw);
  assertHttpsOrLocalDemo(
    endpoint,
    "Remote receipt claim requires HTTPS (HTTP is allowed only for localhost demo)",
  );
  const origin = ourOrgRef();
  const eventId = randomUUID();
  const wirePayload: Record<string, string> = {
    receipt_id: verified.payload.receipt.receipt_id,
    receipt_digest: verified.payload.digest,
  };
  if (verified.payload.receipt.claim?.claim_key) {
    wirePayload.claim_key = verified.payload.receipt.claim.claim_key;
  }
  if (/"amount"|"total_amount"|"lines"/.test(JSON.stringify(wirePayload))) {
    throw new Error("Wire receipt claim must not include amount or lines");
  }
  const envelope = maybeSignEnvelope({
    protocol_version: "1",
    event_id: eventId,
    occurred_at: new Date().toISOString(),
    origin,
    destination: { org_id: verified.payload.receipt.issuer.org_id },
    identity: { org_ref: origin },
    event: {
      type: "steward.receipt.claim.requested",
      payload: wirePayload,
    },
    signature: null,
  });
  if (!envelope.signature) {
    throw new Error("Claimant OOO protocol signing key is required");
  }
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });
  const body = await response.json().then(
    (parsed) => parsed as Record<string, unknown>,
    () => ({ ok: false, error: "invalid_json_response" }),
  );
  return { status: response.status, body, event_id: eventId };
}
