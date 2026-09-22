import { z } from "zod";
import { iso4217CurrencySchema } from "../iso4217.js";

export const iso20022TransactionSchema = z.object({
  message_family: z.enum(["camt", "pain", "pacs", "acmt", "semt", "fxtr"]),
  message_type: z.string().regex(/^[a-z]{4}\.\d{3}\.\d{3}$/),
  transaction_id: z.string().min(1),
  booking_date: z.string().date(),
  value_date: z.string().date().optional(),
  amount: z.string().regex(/^\d+(?:\.\d+)?$/),
  currency: iso4217CurrencySchema,
  debtor_name: z.string().optional(),
  creditor_name: z.string().optional(),
  remittance_information: z.string().max(140).optional(),
  end_to_end_id: z.string().optional(),
});

export type Iso20022Transaction = z.output<typeof iso20022TransactionSchema>;
