import { validateProtocolState } from "./validate.js";
import { getProtocolOutboxDir } from "./paths.js";
import { listOutboxEventIdsWithoutProvenance } from "./outbox-provenance.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { verifyOutboxProvenance } from "./outbox-provenance.js";
import { assertEnvelopeAllowedForPeer } from "./peer-protocol-policy.js";

export function isPreDeliverValidateSkipped(): boolean {
  return process.env.STEWARD_SKIP_DELIVER_VALIDATE === "1";
}

export function assertProtocolDeliverGate(): void {
  if (isPreDeliverValidateSkipped()) return;

  const result = validateProtocolState();
  if (!result.ok) {
    const summary = result.issues.map((i) => `${i.code}: ${i.message}`).join("; ");
    throw new Error(`protocol validate failed before deliver — ${summary}`);
  }

  const missing = listOutboxEventIdsWithoutProvenance(getProtocolOutboxDir());
  if (missing.length > 0) {
    throw new Error(
      `outbox contains ${missing.length} envelope(s) without steward-provenance (direct write blocked): ${missing.slice(0, 3).join(", ")}`
    );
  }
}

export function assertEnvelopeDeliverAuthorized(envelope: EventEnvelope, peerId: string): void {
  if (!isPreDeliverValidateSkipped()) {
    const provenance = verifyOutboxProvenance(getProtocolOutboxDir(), envelope);
    if (!provenance.ok) {
      throw new Error(provenance.reason ?? "outbox provenance check failed");
    }
  }
  assertEnvelopeAllowedForPeer(peerId, envelope.event.type, envelope.event.payload);
}
