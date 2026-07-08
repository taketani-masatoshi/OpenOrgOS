import { z } from "zod";
import { witnessAttestationSchema } from "./witness-attestation.js";

export const witnessReceiptStatusSchema = z.enum(["unilateral", "mutually_confirmed"]);

export const witnessReceiptSchema = z.object({
  receipt_id: z.string().min(1),
  event_id: z.string().uuid(),
  envelope_digest: z.string().regex(/^[a-f0-9]{64}$/),
  status: witnessReceiptStatusSchema,
  attestations: z.array(witnessAttestationSchema),
  issued_at: z.string().min(1),
  hub_id: z.string().min(1),
  hub_signature: z.string().min(1),
});

export type WitnessReceiptStatus = z.output<typeof witnessReceiptStatusSchema>;
export type WitnessReceipt = z.output<typeof witnessReceiptSchema>;
