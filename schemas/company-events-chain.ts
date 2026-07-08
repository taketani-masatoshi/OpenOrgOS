import { z } from "zod";

export const companyEventChainActionSchema = z.enum(["create", "void"]);

export const companyEventChainLinkSchema = z.object({
  seq: z.number().int().positive(),
  link_id: z.string().regex(/^CEL-\d+$/),
  action: companyEventChainActionSchema,
  event_id: z.string().min(1),
  target_event_id: z.string().optional(),
  prev_digest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  payload_digest: z.string().regex(/^[a-f0-9]{64}$/),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  recorded_at: z.string().min(1),
});

export type CompanyEventChainAction = z.output<typeof companyEventChainActionSchema>;
export type CompanyEventChainLink = z.output<typeof companyEventChainLinkSchema>;
