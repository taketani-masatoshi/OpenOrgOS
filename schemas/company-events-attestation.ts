import { z } from "zod";

export const companyEventsAttestationTypeSchema = z.enum(["weekly_batch"]);

export const companyEventsAttestationSchema = z.object({
  attestation_id: z.string().regex(/^CEA-\d{4}-W\d{2}$/),
  attestation_type: companyEventsAttestationTypeSchema,
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  chain_verified_at: z.string().min(1),
  chain_ok: z.boolean(),
  chain_checked: z.number().int().nonnegative(),
  chain_tail_seq: z.number().int().positive().optional(),
  chain_tail_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  chain_tail_link_id: z.string().optional(),
  links_since_prev: z.number().int().nonnegative(),
  prev_attestation_id: z.string().optional(),
  registry_event_count: z.number().int().nonnegative(),
  payload_digest: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
  public_key: z.string().min(1),
  signed_at: z.string().min(1),
});

export type CompanyEventsAttestation = z.output<typeof companyEventsAttestationSchema>;
export type CompanyEventsAttestationType = z.output<typeof companyEventsAttestationTypeSchema>;
