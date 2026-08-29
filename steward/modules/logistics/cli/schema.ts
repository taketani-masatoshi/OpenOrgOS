/**
 * Logistics module — activation seed schemas (co-located with the module CLI).
 *
 * Mirrors the catalog seed contract in `schemas/catalog-module-seeds.ts`: `shipment.origin`
 * is a warehouse id, and status stays an open string so tenant ledgers that pass the
 * catalog check are not rejected here.
 */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Shipment status the SLA report is scoped to. */
export const SHIPMENT_STATUS_IN_TRANSIT = "in_transit";
/** Warehouse status counted as operating capacity. */
export const WAREHOUSE_STATUS_ACTIVE = "active";

export const logisticsWarehousesFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  warehouses: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      capacity_pallets: z.number().int().nonnegative().optional(),
      status: z.string().min(1),
    })
  ),
});

export const logisticsShipmentsFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  shipments: z.array(
    z.object({
      id: z.string().min(1),
      shipper_id: z.string().min(1).optional(),
      /** Warehouse id the shipment leaves from. */
      origin: z.string().min(1),
      destination: z.string().min(1).optional(),
      status: z.string().min(1),
      /** Promised delivery date — the SLA reference in this seed contract. */
      scheduled_date: isoDate.optional(),
      delivered_date: isoDate.optional(),
    })
  ),
});

export type LogisticsWarehousesFile = z.output<typeof logisticsWarehousesFileSchema>;
export type LogisticsShipmentsFile = z.output<typeof logisticsShipmentsFileSchema>;
export type LogisticsWarehouse = LogisticsWarehousesFile["warehouses"][number];
export type LogisticsShipment = LogisticsShipmentsFile["shipments"][number];
