import { z } from "zod";
import { monthString } from "../common.js";

export const inventoryMonthSchema = z.object({
  month: monthString,
  account_code: z.string().regex(/^\d{4}$/),
  ending_inventory_yen: z.number().int().nonnegative(),
  cogs_account_code: z.string().regex(/^\d{4}$/).optional(),
  cogs_yen: z.number().int().nonnegative().optional(),
  consumption_tax_adjustment: z.object({
    direction: z.enum(["exempt_to_taxable", "taxable_to_exempt"]),
    input_tax_yen: z.number().int().nonnegative(),
    evidence_ref: z.string().min(1),
  }).optional(),
});

export const inventoryFileSchema = z.object({
  version: z.literal(1).default(1),
  months: z.array(inventoryMonthSchema).default([]),
});

export type InventoryFile = z.output<typeof inventoryFileSchema>;
