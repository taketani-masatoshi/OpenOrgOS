import { z } from "zod";

export const resilienceSlaTierSchema = z.enum([
  "bronze",
  "silver",
  "silver-email",
  "gold",
  "platinum",
]);

export const resilienceSlaStateSchema = z.enum(["committed", "delivered", "attested"]);

export const resilienceSlaEvaluationSchema = z.object({
  event_id: z.string().uuid(),
  tier: resilienceSlaTierSchema,
  state: resilienceSlaStateSchema,
  satisfied: z.boolean(),
  missing: z.array(z.string()).default([]),
});

export type ResilienceSlaTier = z.output<typeof resilienceSlaTierSchema>;
export type ResilienceSlaState = z.output<typeof resilienceSlaStateSchema>;
export type ResilienceSlaEvaluation = z.output<typeof resilienceSlaEvaluationSchema>;
