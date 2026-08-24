import { z } from "zod";
import { monthString } from "../common.js";

const scenarioTotalsSchema = z.object({
  revenue: z.number().nonnegative(),
  operating_expenses: z.number().nonnegative(),
  operating_profit: z.number(),
});

const propertyScenarioSchema = z.object({
  id: z.enum(["downside", "base", "upside"]),
  label: z.string().min(1),
  kamezawa: z.object({
    adr: z.number().nonnegative(),
    occupancy_opening_month: z.number().min(0).max(1),
    occupancy_steady: z.number().min(0).max(1),
  }),
  totals: scenarioTotalsSchema,
});

export const propertyScenariosPlanSchema = z.object({
  schema_version: z.literal(1),
  fiscal_year: z.string().min(1),
  period_from: monthString,
  period_to: monthString,
  status: z.enum(["draft", "approved", "archived"]),
  selected_for_budget: z.enum(["downside", "base", "upside"]),
  governance: z.object({
    owner: z.string().min(1),
    approver: z.string().min(1),
    review_frequency: z.string().min(1),
    actual_cutoff: monthString.optional(),
  }),
  common_assumptions: z.object({
    bancho_monthly_rent: z.number().nonnegative(),
    bancho_maintenance_annual: z.number().nonnegative(),
    bancho_depreciation_annual: z.number().nonnegative(),
    kamezawa_opening_month: monthString,
    kamezawa_ota_commission_rate: z.number().min(0).max(1),
    kamezawa_management_fee_rate: z.number().min(0).max(1),
    kamezawa_average_stay_nights: z.number().positive(),
    kamezawa_cleaning_per_stay: z.number().nonnegative(),
    kamezawa_amenities_per_occupied_night: z.number().nonnegative(),
    kamezawa_fixed_cost_monthly: z.number().nonnegative(),
    kamezawa_building_depreciation_fy: z.number().nonnegative(),
    kamezawa_equipment_depreciation_fy: z.number().nonnegative(),
    planning_nights_per_month: z.number().int().positive(),
    corporate_expense: z.number().nonnegative(),
  }),
  monthly_revenue: z.array(
    z.object({
      month: monthString,
      bancho: z.number().nonnegative(),
      kamezawa: z.number().nonnegative(),
      other: z.number().nonnegative().default(0),
    })
  ),
  scenarios: z.array(propertyScenarioSchema).length(3),
  notes: z.string().optional(),
});

export type PropertyScenariosPlan = z.output<typeof propertyScenariosPlanSchema>;
