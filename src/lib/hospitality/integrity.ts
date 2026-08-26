import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { hospitalityStaysFileSchema, lodgingTaxLedgerFileSchema } from "../../../schemas/hospitality-ops.js";
import { propertyRevenuePlanSchema } from "../../../schemas/finance.js";
import { loadProperties } from "../data.js";
import { getDataDir } from "../utils.js";
import {
  collectOpenedDateIntegrityIssues,
  type HospitalityIntegrityIssue,
} from "./opened-date-integrity.js";

export type { HospitalityIntegrityIssue };
export { collectOpenedDateIntegrityIssues };

export function collectHospitalityIntegrityIssues(): HospitalityIntegrityIssue[] {
  const properties = loadProperties().map((p) => ({
    id: p.id,
    hotel: p.hotel
      ? { room_count: p.hotel.room_count, opened_date: p.hotel.opened_date }
      : undefined,
  }));

  const staysPath = join(getDataDir(), "operations", "stays.yaml");
  const taxPath = join(getDataDir(), "operations", "lodging-tax.yaml");
  const revenuePath = join(getDataDir(), "plans", "property-revenue.yaml");

  let stays: { id: string; property_id: string; status: string; check_in: string }[] = [];
  if (existsSync(staysPath)) {
    const file = hospitalityStaysFileSchema.parse(YAML.parse(readFileSync(staysPath, "utf-8")));
    stays = file.stays.map((s) => ({
      id: s.id,
      property_id: s.property_id,
      status: s.status,
      check_in: s.check_in,
    }));
  }

  let assessments: { id: string; stay_id: string; property_id: string; period: string }[] = [];
  if (existsSync(taxPath)) {
    const file = lodgingTaxLedgerFileSchema.parse(YAML.parse(readFileSync(taxPath, "utf-8")));
    assessments = file.assessments.map((a) => ({
      id: a.id,
      stay_id: a.stay_id,
      property_id: a.property_id,
      period: a.period,
    }));
  }

  let hotelRevenuePlans: { property_id: string; room_count: number }[] = [];
  if (existsSync(revenuePath)) {
    const plan = propertyRevenuePlanSchema.parse(YAML.parse(readFileSync(revenuePath, "utf-8")));
    hotelRevenuePlans = plan.hotel.map((h) => ({
      property_id: h.property_id,
      room_count: h.room_count,
    }));
  }

  return collectOpenedDateIntegrityIssues({
    properties,
    stays,
    assessments,
    hotelRevenuePlans,
  });
}
