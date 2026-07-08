import { z } from "zod";

export const signingKeyMetaSchema = z.object({
  rotated_at: z.string().min(1),
  public_key: z.string().min(1),
});

export type SigningKeyMeta = z.output<typeof signingKeyMetaSchema>;
