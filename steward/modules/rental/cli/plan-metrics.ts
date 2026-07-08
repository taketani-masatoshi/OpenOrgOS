import type { PropertyRevenuePlan } from "../../../../schemas/plan.js";

export interface RentalPlanMetrics {
  monthlyRevenue: number;
  annualRevenue: number;
  noi: number;
}

export function computeRentalPlanMetrics(
  plan: PropertyRevenuePlan,
  propertyId: string
): RentalPlanMetrics | undefined {
  const rentalPlan = plan.rental.find((r) => r.property_id === propertyId);
  if (!rentalPlan) return undefined;

  const monthlyRevenue = rentalPlan.monthly_rent * (1 - rentalPlan.vacancy_rate);
  const annualRevenue = monthlyRevenue * 12;
  const noi = annualRevenue - rentalPlan.management_fee * 12;
  return { monthlyRevenue, annualRevenue, noi };
}
