/**
 * Deterministic hospitality lint: opened_date vs stays/tax, room_count plan alignment.
 * First release: stay/tax issues are warnings (mal may still have pre-open demo stays).
 */

export type HospitalityIntegrityIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
};

export type PropertyHotelSlice = {
  id: string;
  hotel?: { room_count?: number; opened_date?: string };
};

export type StaySlice = {
  id: string;
  property_id: string;
  status: string;
  check_in: string;
};

export type TaxAssessmentSlice = {
  id: string;
  stay_id: string;
  property_id: string;
  period: string;
};

export type HotelRevenueSlice = {
  property_id: string;
  room_count: number;
};

function openMonth(openedDate: string): string {
  return openedDate.slice(0, 7);
}

/**
 * Pure checks — suitable for fixture unit tests without a full tenant.
 */
export function collectOpenedDateIntegrityIssues(input: {
  properties: PropertyHotelSlice[];
  stays: StaySlice[];
  assessments?: TaxAssessmentSlice[];
  hotelRevenuePlans?: HotelRevenueSlice[];
}): HospitalityIntegrityIssue[] {
  const issues: HospitalityIntegrityIssue[] = [];
  const openedByProp = new Map<string, string>();
  const roomByProp = new Map<string, number>();

  for (const p of input.properties) {
    if (p.hotel?.opened_date) openedByProp.set(p.id, p.hotel.opened_date);
    if (p.hotel?.room_count != null) roomByProp.set(p.id, p.hotel.room_count);
  }

  for (const stay of input.stays) {
    if (stay.status === "cancelled") continue;
    const opened = openedByProp.get(stay.property_id);
    if (!opened) continue;
    if (stay.check_in < opened) {
      issues.push({
        level: "warning",
        file: "data/operations/stays.yaml",
        message: `${stay.id}: check_in ${stay.check_in} is before opened_date ${opened} (${stay.property_id})`,
      });
    }
  }

  for (const a of input.assessments ?? []) {
    const opened = openedByProp.get(a.property_id);
    if (!opened) continue;
    const openMo = openMonth(opened);
    if (a.period < openMo) {
      issues.push({
        level: "warning",
        file: "data/operations/lodging-tax.yaml",
        message: `${a.id}: assessment period ${a.period} is before open month ${openMo} (${a.property_id})`,
      });
    }
    const stay = input.stays.find((s) => s.id === a.stay_id);
    if (stay && stay.status !== "cancelled" && stay.check_in < opened) {
      issues.push({
        level: "warning",
        file: "data/operations/lodging-tax.yaml",
        message: `${a.id}: linked stay ${a.stay_id} check_in ${stay.check_in} is before opened_date ${opened}`,
      });
    }
  }

  for (const plan of input.hotelRevenuePlans ?? []) {
    const ssot = roomByProp.get(plan.property_id);
    if (ssot == null) continue;
    if (plan.room_count !== ssot) {
      issues.push({
        level: "warning",
        file: "data/plans/property-revenue.yaml",
        message: `${plan.property_id}: hotel.room_count ${plan.room_count} != property SSOT ${ssot} (monthly plan scales with room_count)`,
      });
    }
    if (plan.room_count > 1) {
      issues.push({
        level: "warning",
        file: "data/plans/property-revenue.yaml",
        message: `${plan.property_id}: room_count=${plan.room_count} multiplies monthly plan revenue; for whole-building rentals keep room_count=1 and note physical rooms separately`,
      });
    }
  }

  return issues;
}
