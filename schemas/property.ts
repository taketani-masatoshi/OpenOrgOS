import { z } from "zod";
import { dateString } from "./common.js";

export const propertyType = z.enum(["rental", "hotel", "mixed"]);

export const rentalBlock = z.object({
  monthly_rent: z.number().nonnegative(),
  vacancy_rate: z.number().min(0).max(1),
  /** 管理費（貸主負担・月額） */
  management_fee: z.number().nonnegative(),
  /** 更新時の更新料（想定・契約に明記があれば優先） */
  renewal_fee: z.number().nonnegative().optional(),
  /** 修繕・維持の年間見込（管理費・減価償却とは別の運営想定） */
  maintenance_annual: z.number().nonnegative().optional(),
});

export const hotelBlock = z.object({
  room_count: z.number().int().positive(),
  occupancy_rate: z.number().min(0).max(1),
  adr: z.number().nonnegative(),
  opened_date: dateString.optional(),
});

export const depreciationBlock = z.object({
  acquisition_cost: z.number().nonnegative(),
  useful_life_years: z.number().int().positive(),
  method: z.enum(["straight_line"]).default("straight_line"),
  annual_amount: z.number().nonnegative(),
  notes: z.string().optional(),
});

export const propertySchema = z.object({
  id: z.string().regex(/^PROP-\d{3,}$/),
  name: z.string().min(1),
  location: z.string().min(1),
  type: propertyType,
  acquired_date: dateString.optional(),
  acquisition_price: z.number().nonnegative().optional(),
  land_area_sqm: z.number().nonnegative().optional(),
  building_area_sqm: z.number().nonnegative().optional(),
  structure: z.string().optional(),
  built_year: z.number().int().optional(),
  financing: z.string().optional(),
  rental: rentalBlock.optional(),
  hotel: hotelBlock.optional(),
  notes: z.string().optional(),
  depreciation: depreciationBlock.optional(),
  operating_costs: z
    .object({
      cleaning_per_stay: z.number().nonnegative(),
      ota_commission_rate: z.number().min(0).max(1),
      management_fee_rate: z.number().min(0).max(1).optional(),
      average_stay_nights: z.number().positive().optional(),
      utilities_monthly: z.number().nonnegative(),
      amenities_per_stay: z.number().nonnegative().optional(),
      amenities_per_occupied_night: z.number().nonnegative().optional(),
      wifi_monthly: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

export type Property = z.output<typeof propertySchema>;
export type PropertyType = z.output<typeof propertyType>;
