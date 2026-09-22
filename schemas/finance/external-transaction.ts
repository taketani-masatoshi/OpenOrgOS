import { z } from "zod";
import { iso4217CurrencySchema, iso4217MinorUnit } from "../iso4217.js";

export const EXTERNAL_FINANCE_SOURCES = [
  "gmo-aozora",
  "wise-business",
  "upsider-card",
  "stripe",
  "paypal",
  "paypay",
] as const;

export const externalFinanceTransactionSchema = z.object({
  tenant_id: z.string().min(1),
  transaction_id: z.string().min(1),
  source: z.enum(EXTERNAL_FINANCE_SOURCES),
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.string().regex(/^\d+(?:\.\d+)?$/),
  currency: iso4217CurrencySchema,
  payer_or_payee: z.string().trim().min(1).max(300),
  transaction_date: z.string().datetime({ offset: true }),
  direction: z.enum(["CREDIT", "DEBIT"]),
  minor_unit: z.number().int().min(0).max(6),
  source_account_id: z.string().min(1).optional(),
  exchange_rate: z.number().positive().optional(),
  exchange_rate_source: z.string().min(1).optional(),
  exchange_rate_at: z.string().datetime({ offset: true }).optional(),
  reference: z.string().max(500).optional(),
  raw_event_id: z.string().min(1),
  metadata: z.record(z.string(), z.string()).default({}),
}).superRefine((value, ctx) => {
  const standard = iso4217MinorUnit(value.currency);
  if (standard !== undefined && value.minor_unit !== standard) {
    ctx.addIssue({ code: "custom", path: ["minor_unit"], message: `${value.currency} requires minor_unit=${standard}` });
  }
  const fraction = value.amount.split(".")[1] ?? "";
  if (fraction.length > value.minor_unit) {
    ctx.addIssue({ code: "custom", path: ["amount"], message: `amount has more than ${value.minor_unit} fractional digits` });
  }
});

export type ExternalFinanceTransaction = z.output<typeof externalFinanceTransactionSchema>;
