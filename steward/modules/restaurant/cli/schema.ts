/**
 * Restaurant module — activation seed schemas (co-located with the module CLI).
 *
 * `restaurant` has no entry in `schemas/catalog-module-seeds.ts`, so the seed
 * contract is defined here and mirrors the other sector modules: amounts carry
 * the `_yen` suffix and lifecycle is expressed as `status`.
 */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Menu item status treated as on-sale when the item uses the `status` spelling. */
export const MENU_STATUS_ACTIVE = "active";
/** Group label for tables that declare no zone. */
export const UNZONED_LABEL = "(unzoned)";
/** Group label for menu items that declare no category. */
export const UNCATEGORISED_LABEL = "(uncategorised)";

export const restaurantMenuFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  items: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      price_yen: z.number().nonnegative().optional(),
      cost_yen: z.number().nonnegative().optional(),
      category: z.string().min(1).optional(),
      status: z.string().min(1).optional(),
    })
  ),
});

export const restaurantTablesFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  tables: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      seats: z.number().int().positive(),
      zone: z.string().min(1).optional(),
      status: z.string().min(1).optional(),
    })
  ),
});

export type RestaurantMenuFile = z.output<typeof restaurantMenuFileSchema>;
export type RestaurantTablesFile = z.output<typeof restaurantTablesFileSchema>;
export type RestaurantMenuItem = RestaurantMenuFile["items"][number];
export type RestaurantTable = RestaurantTablesFile["tables"][number];

/** An item that declares no status counts as on sale. */
export function isMenuItemAvailable(item: RestaurantMenuItem): boolean {
  return item.status ? item.status === MENU_STATUS_ACTIVE : true;
}
