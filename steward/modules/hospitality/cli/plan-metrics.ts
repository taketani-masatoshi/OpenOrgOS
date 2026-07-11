import type { PropertyRevenuePlan } from "../../../../schemas/finance/types.js";

export interface HotelPlanMetrics {
  monthlyRevenue: number;
  annualRevenue: number;
  revpar: number;
}

export function computeHotelPlanMetrics(
  plan: PropertyRevenuePlan,
  propertyId: string
): HotelPlanMetrics | undefined {
  const hotelPlan = plan.hotel.find((h) => h.property_id === propertyId);
  if (!hotelPlan) return undefined;

  const monthlyRevenue = hotelPlan.room_count * hotelPlan.occupancy_rate * hotelPlan.adr * 30;
  const annualRevenue = hotelPlan.room_count * hotelPlan.occupancy_rate * hotelPlan.adr * 365;
  const revpar = hotelPlan.occupancy_rate * hotelPlan.adr;
  return { monthlyRevenue, annualRevenue, revpar };
}
