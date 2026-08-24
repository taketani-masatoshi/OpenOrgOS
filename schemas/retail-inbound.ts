import { z } from "zod";
import { dateString } from "./common.js";

/** Purchase / marketplace inbound (Amazon · 楽天 · 仕入) — L1 board source. */
export const retailInboundChannelSchema = z.enum([
  "amazon",
  "rakuten",
  "supplier",
  "individual",
  "other",
]);

export const retailInboundStatusSchema = z.enum([
  "ordered",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

export const retailInboundLineSchema = z.object({
  sku_id: z.string().min(1).optional(),
  item_name: z.string().min(1).max(80),
  qty: z.number().positive(),
});

export const retailInboundOrderSchema = z.object({
  id: z.string().min(1),
  channel: retailInboundChannelSchema,
  /** Shop / seller display label (no account numbers). */
  source_label: z.string().min(1).max(80),
  /** Human origin city/region optional */
  origin_label: z.string().max(60).optional(),
  destination_store_id: z.string().min(1),
  status: retailInboundStatusSchema,
  ordered_on: dateString,
  eta_date: dateString,
  delivered_on: dateString.optional(),
  lines: z.array(retailInboundLineSchema).min(1),
  notes: z.string().max(200).optional(),
});

export const retailInboundOrdersFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: dateString.optional(),
  orders: z.array(retailInboundOrderSchema),
});

export type RetailInboundOrder = z.output<typeof retailInboundOrderSchema>;
export type RetailInboundOrdersFile = z.output<
  typeof retailInboundOrdersFileSchema
>;
