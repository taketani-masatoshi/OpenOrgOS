/**
 * Retail store module — activation seed schemas (co-located with the module CLI).
 *
 * Mirrors the catalog seed contract in `schemas/catalog-module-seeds.ts`: `sku.store_id`
 * is optional there and status is an open string, so both stay permissive here.
 * Price/cost/stock are optional because the catalog check does not require them.
 */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** SKU status counted in the margin report. */
export const SKU_STATUS_ACTIVE = "active";
/** Store status counted as trading. */
export const STORE_STATUS_OPEN = "open";
/** Units at or below this on-hand quantity are flagged as low stock. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export const retailStoresFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  stores: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      address: z.string().min(1).optional(),
      pos_terminals: z.number().int().nonnegative().optional(),
      status: z.string().min(1),
    })
  ),
});

export const retailSkusFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  skus: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      price_yen: z.number().nonnegative().optional(),
      cost_yen: z.number().nonnegative().optional(),
      store_id: z.string().min(1).optional(),
      stock_qty: z.number().int().nonnegative().optional(),
      status: z.string().min(1),
    })
  ),
});

export type RetailStoresFile = z.output<typeof retailStoresFileSchema>;
export type RetailSkusFile = z.output<typeof retailSkusFileSchema>;
export type RetailStore = RetailStoresFile["stores"][number];
export type RetailSku = RetailSkusFile["skus"][number];
