import { z } from "zod";
import { witnessAttestationSchema, type WitnessAttestation } from "../../../schemas/protocol/witness-attestation.js";
import { appendJsonl, loadJsonl } from "../jsonl-store.js";
import { getClock, getIdGenerator } from "../runtime-context.js";
import { getHubAttestationsPath } from "./paths.js";

export const storedWitnessAttestationSchema = witnessAttestationSchema.extend({
  attestation_id: z.string().min(1),
  recorded_at: z.string().min(1),
});

export type StoredWitnessAttestation = z.output<typeof storedWitnessAttestationSchema>;

function generateAttestationId(): string {
  return getIdGenerator().uniqueId("WATT");
}

export function loadHubAttestations(): StoredWitnessAttestation[] {
  return loadJsonl(getHubAttestationsPath(), (raw) => storedWitnessAttestationSchema.parse(raw));
}

export function findAttestationsByEventId(eventId: string): StoredWitnessAttestation[] {
  return loadHubAttestations().filter((a) => a.event_id === eventId);
}

export function findAttestation(
  eventId: string,
  side: WitnessAttestation["side"],
  orgId: string
): StoredWitnessAttestation | undefined {
  return loadHubAttestations().find(
    (a) => a.event_id === eventId && a.side === side && a.org_ref.org_id === orgId
  );
}

export function appendHubAttestation(attestation: WitnessAttestation): StoredWitnessAttestation {
  const existing = findAttestation(attestation.event_id, attestation.side, attestation.org_ref.org_id);
  if (existing) {
    if (existing.envelope_digest !== attestation.envelope_digest) {
      throw new Error(
        `Attestation digest mismatch for ${attestation.event_id} ${attestation.side} from ${attestation.org_ref.org_id}`
      );
    }
    return existing;
  }

  const stored = storedWitnessAttestationSchema.parse({
    ...attestation,
    attestation_id: generateAttestationId(),
    recorded_at: getClock().nowIso(),
  });
  appendJsonl(getHubAttestationsPath(), stored);
  return stored;
}

export interface AttestationStatus {
  event_id: string;
  sent?: StoredWitnessAttestation;
  received?: StoredWitnessAttestation;
  digest_match: boolean;
}

export function getAttestationStatus(eventId: string): AttestationStatus {
  const attestations = findAttestationsByEventId(eventId);
  const sent = attestations.find((a) => a.side === "sent");
  const received = attestations.find((a) => a.side === "received");
  const digest_match =
    !!sent &&
    !!received &&
    sent.envelope_digest === received.envelope_digest &&
    sent.envelope_digest.length === 64;
  return { event_id: eventId, sent, received, digest_match };
}
