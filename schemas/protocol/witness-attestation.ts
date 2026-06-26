import { z } from "zod";
import { orgRefSchema } from "./org-event.js";

export const witnessAttestationSideSchema = z.enum(["sent", "received"]);

export const witnessAttestationSchema = z.object({
  event_id: z.string().uuid(),
  envelope_digest: z.string().regex(/^[a-f0-9]{64}$/),
  side: witnessAttestationSideSchema,
  origin: orgRefSchema,
  destination: orgRefSchema,
  transaction_type: z.string().min(1),
  attested_at: z.string().min(1),
  org_ref: orgRefSchema,
  org_public_key: z.string().min(1),
  org_signature: z.string().min(1),
});

export type WitnessAttestationSide = z.output<typeof witnessAttestationSideSchema>;
export type WitnessAttestation = z.output<typeof witnessAttestationSchema>;
