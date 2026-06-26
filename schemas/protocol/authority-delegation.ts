import { z } from "zod";
import { orgRefSchema } from "./org-event.js";
import { actorIdentitySchema } from "./identity-exchange.js";

export const delegationGrantSchema = z.object({
  grant_id: z.string().min(1),
  grantor: orgRefSchema,
  grantee: z.union([orgRefSchema, actorIdentitySchema]),
  scope: z.array(z.string().min(1)).min(1),
  valid_from: z.string().min(1),
  valid_until: z.string().optional(),
  revoked_at: z.string().optional(),
});

export const delegationProofSchema = z.object({
  grant: delegationGrantSchema,
  basis_ref: z.string().optional(),
  issued_at: z.string().min(1),
});

export type DelegationGrant = z.output<typeof delegationGrantSchema>;
export type DelegationProof = z.output<typeof delegationProofSchema>;
