import { z } from "zod";
import { quorumModeSchema } from "./witness-pool.js";
import { witnessReceiptSchema } from "./witness-receipt.js";

export const witnessQuorumResultSchema = z.object({
  event_id: z.string().uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  receipts: z.array(witnessReceiptSchema),
  satisfied: z.boolean(),
  required: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  mode: quorumModeSchema,
});

export type WitnessQuorumResult = z.output<typeof witnessQuorumResultSchema>;
