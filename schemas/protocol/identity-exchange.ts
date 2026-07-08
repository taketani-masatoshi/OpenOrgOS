import { z } from "zod";
import { orgRefSchema } from "./org-event.js";

export const orgIdentityDocumentSchema = z.object({
  org_ref: orgRefSchema,
  jurisdiction: z.string().min(2),
  display_name: z.string().min(1),
  public_ids: z
    .object({
      corporate_number: z.string().optional(),
      lei: z.string().optional(),
    })
    .optional(),
  stakeholder_id: z.string().optional(),
  /** Base64 SPKI DER for protocol envelope verification. */
  protocol_public_key: z.string().optional(),
  issued_at: z.string().min(1),
  expires_at: z.string().optional(),
});

export const actorIdentitySchema = z.object({
  actor_id: z.string().min(1),
  role: z.string().min(1),
  org_ref: orgRefSchema,
});

export type OrgIdentityDocument = z.output<typeof orgIdentityDocumentSchema>;
export type ActorIdentity = z.output<typeof actorIdentitySchema>;
