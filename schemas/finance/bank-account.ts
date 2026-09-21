import { z } from "zod";

export const bankAccountStatusSchema = z.enum(["none", "active"]);

export const bankAccountFileSchema = z.object({
  version: z.literal(1),
  status: bankAccountStatusSchema,
});

export type BankAccountStatus = z.output<typeof bankAccountStatusSchema>;
export type BankAccountFile = z.output<typeof bankAccountFileSchema>;
